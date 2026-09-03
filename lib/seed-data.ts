/**
 * Generates a realistic mid-program dataset for one account: goals/targets,
 * coach documents + protocols, and SEED_DAYS days of health data. Extracted
 * from scripts/seed.ts (which is now a thin wrapper) so it's independently
 * testable and reusable across more than one seeded account — e.g. the demo
 * coach account and a demo client account underneath it, so the coach
 * dashboard's client list has a real client to show.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import {
  accounts,
  checkIns,
  documents,
  getDb,
  hydrationEntries,
  nutritionEntries,
  protocols,
  settings,
  sleepSessions,
  weeklyTargets,
  weightEntries,
  workouts,
} from "./db";
import { addDays, localDateOf, mondayOf, todayLocal } from "./dates";
import { indexDocument } from "./rag";
import { hashPasscode } from "./auth";
import { dataAnswers, generateCheckinDraft, generateWeeklyAnalysis } from "./ai/analysis";
import { getSettings, getTargets, weekStats } from "./stats";
import type { CheckinQuestion } from "./checkin-template";
import type { ProgramType } from "./program-types";

export const SEED_DAYS = 35;
export const SEED_TZ = "America/Los_Angeles";

export const COACH_PLAN_TEXT = `Hey man,

Great work at the last check-in — conditioning is coming in right on schedule. Here's the updated plan starting Monday July 6th.

NUTRITION (every day, weigh and log everything in MyFitnessPal):
- Calories: 2100
- Protein: 210g
- Carbs: 185g
- Fat: 55g

Keep the refeed structure the same for now — we'll add one back in if strength drops two weeks in a row.

CARDIO:
4 sessions per week, 35 minutes incline treadmill walk (12% / 3.0mph), first thing fasted or right after lifting. Keep steps around 9-10k on non-cardio days.

WATER: minimum 3 liters a day, more on training days.
SLEEP: protect your 7 hours, this matters more from here on out.

Weigh in every morning after the bathroom, before food. Waist measurement with the check-in every Sunday.

We're 11 weeks out from your target date — this is where the work compounds. Trust the process.

— Coach Dan`;

export const FINAL_PHASE_TEXT = `FINAL PHASE ADJUSTMENTS — draft, we will finalize 2 weeks out.

Mon-Wed (lower carb): calories drop to 1900, carbs 90g, protein stays 210g, fat 45g. Two full-body training sessions Mon/Tue.
Thu-Fri (higher carb): carbs up to 400g, fat under 40g, sodium normal, water 6L Thursday tapering to 3L Friday.
Sat (target day): keep meals light and simple, sip water rather than chugging it.

No cardio after Wednesday.

This takes effect Monday September 21st. Do not start early.

— Coach Dan`;

export const PROGRAM_RULES_TEXT = `PROGRAM GUIDELINES (excerpt)

Logging: weigh and log everything daily in MyFitnessPal, even off-plan days — accuracy matters more than "looking good" on the log.

Communication: flag pain, illness, or missed sessions the same day, not at the weekly check-in. Don't wait until Sunday to mention something from Tuesday.

Adjustments: don't self-adjust calories, cardio, or training volume between check-ins — bring it up and we'll adjust together if something isn't working.

Sleep & recovery: protect the prescribed minimum hours; recovery debt compounds and shows up in the numbers within a week or two.

Consistency over intensity: a missed session logged honestly is more useful to the plan than a skipped one that goes unmentioned.`;

export interface SeedAccountConfig {
  name: string;
  role: "coach" | "client";
  passcode: string;
  targetName: string;
  targetNote: string;
  programType: ProgramType;
  targetDateOffsetDays: number;
  targetWeightLbs: number;
  heightInches: number;
  /** Weight curve: roughly `startWeightLbs` at day 0 trending to `endWeightLbs` at day SEED_DAYS-1, plus noise. */
  startWeightLbs: number;
  endWeightLbs: number;
  activeCalories: number;
  activeProteinG: number;
  activeCarbsG: number;
  activeFatG: number;
  pendingCalories: number;
  pendingProteinG: number;
  pendingCarbsG: number;
  pendingFatG: number;
  /** Seeds this account's own PRNG so two accounts don't share identical noise. */
  rngSeed: number;
}

export interface SeedAccountSummary {
  nutritionCount: number;
  weightCount: number;
  hydrationCount: number;
  sleepCount: number;
  workoutCount: number;
}

/** Deterministic PRNG so a given seed always produces the same numbers. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UTC instant for a local-LA time on a given date (fixed PDT offset is fine for seed data). */
function at(date: string, hour: number, minute = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour + 7, minute)).toISOString();
}

/** Finds the named account, or creates it with the given role/passcode. Idempotent across runs. */
export async function findOrCreateAccount(
  cfg: Pick<SeedAccountConfig, "name" | "role" | "passcode">,
): Promise<number> {
  const db = await getDb();
  const [existing] = await db.select().from(accounts).where(eq(accounts.name, cfg.name));
  if (existing) return existing.id;
  const passcodeHash = await hashPasscode(cfg.passcode);
  const [row] = await db
    .insert(accounts)
    .values({ name: cfg.name, role: cfg.role, passcodeHash })
    .returning();
  return row.id;
}

/** Populates one account's settings/targets/documents/protocols/health data. Idempotent: reseeds in place. */
export async function seedAccountData(
  accountId: number,
  cfg: SeedAccountConfig,
): Promise<SeedAccountSummary> {
  const db = await getDb();
  const rand = mulberry32(cfg.rngSeed);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const today = todayLocal(SEED_TZ);
  const start = addDays(today, -(SEED_DAYS - 1));

  // ---- Settings & targets --------------------------------------------------
  const seedSettings = await getSettings(accountId);
  await db
    .update(settings)
    .set({
      targetName: cfg.targetName,
      targetDate: addDays(today, cfg.targetDateOffsetDays),
      programType: cfg.programType,
      targetNote: cfg.targetNote,
      targetWeightLbs: cfg.targetWeightLbs,
      heightInches: cfg.heightInches,
      timezone: SEED_TZ,
    })
    .where(eq(settings.id, seedSettings.id));

  const seedTargets = await getTargets(accountId);
  await db
    .update(weeklyTargets)
    .set({ waterMlMin: 3000, sleepHoursMin: 7, workoutsPerWeekMin: 3, cardioSessionsPerWeek: 4 })
    .where(eq(weeklyTargets.id, seedTargets.id));

  // ---- Documents & protocols (refresh seeded ones) --------------------------
  await db
    .delete(documents)
    .where(and(eq(documents.accountId, accountId), like(documents.title, "[seed]%")));
  const seededProtocols = await db
    .select({ id: protocols.id })
    .from(protocols)
    .where(
      and(eq(protocols.accountId, accountId), inArray(protocols.status, ["pending", "active", "superseded"])),
    );
  if (seededProtocols.length) {
    await db.delete(protocols).where(inArray(protocols.id, seededProtocols.map((p) => p.id)));
  }

  const [planDoc] = await db
    .insert(documents)
    .values({
      accountId,
      title: "[seed] Coach Dan — updated macros & cardio (July 6)",
      category: "coach_protocol",
      sourceType: "email_paste",
      contentText: COACH_PLAN_TEXT,
    })
    .returning();

  const [finalPhaseDoc] = await db
    .insert(documents)
    .values({
      accountId,
      title: "[seed] Coach Dan — final phase protocol (draft)",
      category: "coach_protocol",
      sourceType: "email_paste",
      contentText: FINAL_PHASE_TEXT,
    })
    .returning();

  await db.insert(documents).values({
    accountId,
    title: "[seed] Program rules & guidelines",
    category: "program_rules",
    sourceType: "txt",
    contentText: PROGRAM_RULES_TEXT,
  });

  await db.insert(protocols).values({
    documentId: planDoc.id,
    accountId,
    status: "active",
    effectiveFrom: addDays(today, -9),
    calories: cfg.activeCalories,
    proteinG: cfg.activeProteinG,
    carbsG: cfg.activeCarbsG,
    fatG: cfg.activeFatG,
    cardioPlan: "4x/week 35min incline treadmill walk (12% / 3.0mph), fasted or post-lift",
    notes: "Refeeds paused; steps 9-10k on non-cardio days; daily weigh-ins.",
    extractedJson: {
      confidence: "high",
      source_quote: `Calories: ${cfg.activeCalories} / Protein: ${cfg.activeProteinG}g / Carbs: ${cfg.activeCarbsG}g / Fat: ${cfg.activeFatG}g`,
    },
    confirmedAt: new Date(),
  });

  // A pending extraction so the confirmation flow is visible in the UI.
  await db.insert(protocols).values({
    documentId: finalPhaseDoc.id,
    accountId,
    status: "pending",
    effectiveFrom: addDays(today, 68),
    calories: cfg.pendingCalories,
    proteinG: cfg.pendingProteinG,
    carbsG: cfg.pendingCarbsG,
    fatG: cfg.pendingFatG,
    cardioPlan: "No cardio after Wednesday of the final phase.",
    notes: "Lower carb Mon-Wed, higher carb Thu-Fri (400g carbs), keep target-day meals light.",
    extractedJson: {
      confidence: "medium",
      source_quote: `calories drop to ${cfg.pendingCalories}, carbs ${cfg.pendingCarbsG}g, protein stays ${cfg.pendingProteinG}g, fat ${cfg.pendingFatG}g`,
    },
  });

  // ---- SEED_DAYS days of health data -----------------------------------------
  const nutritionRows: (typeof nutritionEntries.$inferInsert)[] = [];
  const weightRows: (typeof weightEntries.$inferInsert)[] = [];
  const hydrationRows: (typeof hydrationEntries.$inferInsert)[] = [];
  const sleepRows: (typeof sleepSessions.$inferInsert)[] = [];
  const workoutRows: (typeof workouts.$inferInsert)[] = [];

  for (let i = 0; i < SEED_DAYS; i++) {
    const date = addDays(start, i);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
    const progress = i / (SEED_DAYS - 1);

    // Weight: startWeightLbs → endWeightLbs with daily noise; skip ~1 morning a week.
    if (rand() > 0.12) {
      const w = cfg.startWeightLbs - (cfg.startWeightLbs - cfg.endWeightLbs) * progress + between(-0.9, 0.9);
      const time = at(date, 6, 45);
      weightRows.push({
        accountId,
        hcUid: `seed-weight-${date}`,
        source: "samsung_health",
        measuredAt: new Date(time),
        localDate: localDateOf(time, SEED_TZ),
        weightLbs: Math.round(w * 10) / 10,
      });
    }

    // Nutrition: 4 meal summaries/day; Saturdays tend to run hot.
    const cheatFactor = dow === 6 && rand() < 0.5 ? between(1.1, 1.22) : 1;
    const dayCal = cfg.activeCalories * cheatFactor * between(0.96, 1.04);
    const meals: [string, number][] = [
      ["breakfast", 0.25],
      ["lunch", 0.3],
      ["dinner", 0.3],
      ["snack", 0.15],
    ];
    const mealHours: Record<string, number> = { breakfast: 7, lunch: 12, dinner: 18, snack: 21 };
    // Skip logging entirely ~1 day in 12.
    if (rand() > 0.08) {
      for (const [meal, share] of meals) {
        const cal = dayCal * share * between(0.92, 1.08);
        const protein = cfg.activeProteinG * share * between(0.9, 1.1) * (cheatFactor > 1 ? 0.95 : 1);
        const carbs = cfg.activeCarbsG * share * cheatFactor * between(0.85, 1.15);
        const fat = Math.max(8, (cal - protein * 4 - carbs * 4) / 9 + between(-2, 2));
        const time = at(date, mealHours[meal]);
        nutritionRows.push({
          accountId,
          hcUid: `seed-nutrition-${date}-${meal}`,
          source: "myfitnesspal",
          localDate: localDateOf(time, SEED_TZ),
          mealType: meal as "breakfast",
          calories: Math.round(cal),
          proteinG: Math.round(protein),
          carbsG: Math.round(carbs),
          fatG: Math.round(fat),
        });
      }
    }

    // Hydration: two logged bottles a day totalling 2.6–3.9L.
    const total = between(2600, 3900);
    for (const [n, share] of [
      [1, 0.55],
      [2, 0.45],
    ] as const) {
      const time = at(date, n === 1 ? 11 : 19);
      hydrationRows.push({
        accountId,
        hcUid: `seed-hydration-${date}-${n}`,
        source: "samsung_health",
        localDate: localDateOf(time, SEED_TZ),
        volumeMl: Math.round(total * share),
      });
    }

    // Sleep: 6.1–8.1h ending this morning.
    const hours = between(6.1, 8.1);
    const wake = at(date, 6, 15);
    const bed = new Date(new Date(wake).getTime() - hours * 3600_000);
    sleepRows.push({
      accountId,
      hcUid: `seed-sleep-${date}`,
      source: "samsung_health",
      localDate: localDateOf(wake, SEED_TZ),
      startedAt: bed,
      endedAt: new Date(wake),
      durationMin: Math.round(hours * 60),
    });

    // Lifting Mon/Tue/Thu/Fri (+Sat sometimes); cardio Mon/Wed/Fri/Sat.
    const liftDays = [1, 2, 4, 5];
    const titles: Record<number, string> = { 1: "Push", 2: "Pull", 4: "Legs", 5: "Upper" };
    if (liftDays.includes(dow) && rand() > 0.1) {
      const startT = at(date, 16, 30);
      workoutRows.push({
        accountId,
        hcUid: `seed-lift-${date}`,
        source: "samsung_health",
        localDate: localDateOf(startT, SEED_TZ),
        startedAt: new Date(startT),
        endedAt: new Date(new Date(startT).getTime() + 70 * 60_000),
        exerciseType: "strength_training",
        isCardio: false,
        title: `${titles[dow]} day`,
        caloriesBurned: Math.round(between(280, 380)),
      });
    }
    if ([1, 3, 5, 6].includes(dow) && rand() > 0.12) {
      const startT = at(date, 6, 55);
      workoutRows.push({
        accountId,
        hcUid: `seed-cardio-${date}`,
        source: "samsung_health",
        localDate: localDateOf(startT, SEED_TZ),
        startedAt: new Date(startT),
        endedAt: new Date(new Date(startT).getTime() + 35 * 60_000),
        exerciseType: "walking",
        isCardio: true,
        title: "Incline walk 12% / 3.0",
        caloriesBurned: Math.round(between(240, 300)),
      });
    }
  }

  const upsert = async <T extends { hcUid?: string | null }>(
    table: typeof nutritionEntries | typeof weightEntries | typeof hydrationEntries | typeof sleepSessions | typeof workouts,
    rows: T[],
  ) => {
    for (const row of rows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.insert(table).values(row as any).onConflictDoNothing();
    }
  };

  await upsert(nutritionEntries, nutritionRows);
  await upsert(weightEntries, weightRows);
  await upsert(hydrationEntries, hydrationRows);
  await upsert(sleepSessions, sleepRows);
  await upsert(workouts, workoutRows);

  return {
    nutritionCount: nutritionRows.length,
    weightCount: weightRows.length,
    hydrationCount: hydrationRows.length,
    sleepCount: sleepRows.length,
    workoutCount: workoutRows.length,
  };
}

/**
 * SEED_AI=1 pre-populates an account with real AI output: document
 * embeddings (so doc chat works immediately), the current week's
 * plain-language analysis, and a filled-in coach check-in draft. Requires
 * ANTHROPIC_API_KEY and VOYAGE_API_KEY.
 */
export async function populateAiContent(accountId: number): Promise<void> {
  const db = await getDb();
  const today = todayLocal(SEED_TZ);

  // 1) Embed every document so doc chat is ready (Voyage free-tier friendly:
  //    embeddings.ts backs off on 429s).
  const docs = await db.select().from(documents).where(eq(documents.accountId, accountId));
  for (const doc of docs) {
    try {
      const chunks = await indexDocument(doc);
      console.log(`  embedded "${doc.title.slice(0, 40)}" (${chunks} chunks)`);
    } catch (err) {
      console.warn(`  embed failed for ${doc.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 2) Seed subjective check-in answers for the current week, then generate
  //    the analysis and the filled-in coach draft.
  const settingsRow = await getSettings(accountId);
  const weekStart = mondayOf(today);
  const manual = {
    waistIn: 31.25,
    strengthTrend:
      "Pressing felt a little flat mid-week but pulls are holding — rows went up 5 lbs.",
    digestion: "Regular, no issues this week.",
    changeRequests: "Could use a few more carbs pre-workout if we have room.",
    manualNotes: null,
  };
  await db
    .insert(checkIns)
    .values({ accountId, weekStart, ...manual, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [checkIns.accountId, checkIns.weekStart],
      set: { ...manual, updatedAt: new Date() },
    });

  try {
    const stats = await weekStats(accountId, weekStart);
    const analysis = await generateWeeklyAnalysis(stats, settingsRow);
    const draft = await generateCheckinDraft({
      template: settingsRow.checkinTemplate as CheckinQuestion[],
      stats,
      settings: settingsRow,
      manual,
    });
    await db
      .update(checkIns)
      .set({
        aiAnalysis: analysis,
        generatedDraft: draft,
        dataAnswers: dataAnswers(stats, settingsRow),
        updatedAt: new Date(),
      })
      .where(and(eq(checkIns.accountId, accountId), eq(checkIns.weekStart, weekStart)));
    console.log("  generated weekly analysis + check-in draft.");
  } catch (err) {
    console.warn(`  analysis/draft failed: ${err instanceof Error ? err.message : err}`);
  }
}
