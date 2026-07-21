/**
 * Seeds a realistic mid-prep dataset so the dashboard, check-in, and calculator
 * are demonstrable before the mobile companion has synced anything.
 *
 * Run with the dev server STOPPED (PGlite is single-process):
 *   pnpm seed
 *
 * Idempotent: health rows upsert on deterministic seed hc_uids; documents,
 * protocols and settings are refreshed each run.
 */
import { eq, like, inArray } from "drizzle-orm";
import {
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
} from "../lib/db";
import { addDays, localDateOf, mondayOf, todayLocal } from "../lib/dates";
import { indexDocument } from "../lib/rag";
import {
  dataAnswers,
  generateCheckinDraft,
  generateWeeklyAnalysis,
} from "../lib/ai/analysis";
import { getSettings, weekStats } from "../lib/stats";
import type { CheckinQuestion } from "../lib/checkin-template";

const TZ = "America/Los_Angeles";
const DAYS = 35;

// Deterministic PRNG so every run produces the same numbers.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260715);
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

/** UTC instant for a local-LA time on a given date (fixed PDT offset is fine for seed data). */
function at(date: string, hour: number, minute = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour + 7, minute)).toISOString();
}

const COACH_PLAN_TEXT = `Hey man,

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

We're 11 weeks out — this is where we make the show. Trust the process.

— Coach Dan`;

const PEAK_WEEK_TEXT = `PEAK WEEK PROTOCOL — draft, we will finalize 2 weeks out.

Mon-Wed (depletion): calories drop to 1900, carbs 90g, protein stays 210g, fat 45g. Two full-body depletion circuits Mon/Tue.
Thu-Fri (load): carbs up to 400g, fat under 40g, sodium normal, water 6L Thursday tapering to 3L Friday.
Sat (show day): rice cakes + honey between prejudging rounds, sips of water only.

No cardio after Wednesday. Posing practice daily but short.

This takes effect Monday September 21st. Do not start early.

— Coach Dan`;

const RULES_TEXT = `NPC CLASSIC PHYSIQUE — DIVISION RULES & GUIDELINES (excerpt)

Height & weight: competitors must not exceed the weight cap for their height class per the official NPC/NPC Worldwide chart (2023 update). Examples: up to 5'8" — 187 lbs; up to 5'10" — 202 lbs; up to 6'0" — 217 lbs.

Attire: competition trunks must be solid black, no logos. No board shorts (Men's Physique) or posing suits (Bodybuilding).

Mandatory poses: front double biceps, side chest, back double biceps, abdominals & thigh, favorite classic pose. No most muscular.

Judging criteria: emphasis on the classic aesthetic — small waist, V-taper, balanced proportions, stage presence and posing artistry, condition.

Tanning: no products that streak. Hair must be well groomed. Jewelry is not permitted on stage.`;

async function main() {
  const db = await getDb();
  const today = todayLocal(TZ);
  const start = addDays(today, -(DAYS - 1));
  console.log(`Seeding ${DAYS} days (${start} → ${today})…`);

  // ---- Settings & targets --------------------------------------------------
  await db
    .update(settings)
    .set({
      showName: "NPC Iron Coast Classic",
      showDate: addDays(today, 73), // ~10.5 weeks out
      division: "classic_physique",
      nextCompetitionNote: "first show of the season, aiming to qualify for state",
      targetStageWeightLbs: 187,
      heightInches: 68,
      timezone: TZ,
    })
    .where(eq(settings.id, 1));

  const [t] = await db.select().from(weeklyTargets).limit(1);
  await db
    .update(weeklyTargets)
    .set({ waterMlMin: 3000, sleepHoursMin: 7, workoutsPerWeekMin: 3, cardioSessionsPerWeek: 4 })
    .where(eq(weeklyTargets.id, t.id));

  // ---- Documents & protocols (refresh seeded ones) --------------------------
  await db.delete(documents).where(like(documents.title, "[seed]%"));
  const seededProtocols = await db
    .select({ id: protocols.id })
    .from(protocols)
    .where(inArray(protocols.status, ["pending", "active", "superseded"]));
  if (seededProtocols.length) {
    await db.delete(protocols).where(
      inArray(protocols.id, seededProtocols.map((p) => p.id)),
    );
  }

  const [planDoc] = await db
    .insert(documents)
    .values({
      title: "[seed] Coach Dan — updated macros & cardio (July 6)",
      category: "coach_protocol",
      sourceType: "email_paste",
      contentText: COACH_PLAN_TEXT,
    })
    .returning();

  const [peakDoc] = await db
    .insert(documents)
    .values({
      title: "[seed] Coach Dan — peak week protocol (draft)",
      category: "coach_protocol",
      sourceType: "email_paste",
      contentText: PEAK_WEEK_TEXT,
    })
    .returning();

  await db.insert(documents).values({
    title: "[seed] NPC Classic Physique rules & guidelines",
    category: "division_rules",
    sourceType: "txt",
    contentText: RULES_TEXT,
  });

  await db.insert(protocols).values({
    documentId: planDoc.id,
    status: "active",
    effectiveFrom: addDays(today, -9),
    calories: 2100,
    proteinG: 210,
    carbsG: 185,
    fatG: 55,
    cardioPlan: "4x/week 35min incline treadmill walk (12% / 3.0mph), fasted or post-lift",
    notes: "Refeeds paused; steps 9-10k on non-cardio days; daily weigh-ins.",
    extractedJson: { confidence: "high", source_quote: "Calories: 2100 / Protein: 210g / Carbs: 185g / Fat: 55g" },
    confirmedAt: new Date(),
  });

  // A pending extraction so the confirmation flow is visible in the UI.
  await db.insert(protocols).values({
    documentId: peakDoc.id,
    status: "pending",
    effectiveFrom: addDays(today, 68),
    calories: 1900,
    proteinG: 210,
    carbsG: 90,
    fatG: 45,
    cardioPlan: "No cardio after Wednesday of peak week.",
    notes: "Depletion Mon-Wed, carb load Thu-Fri (400g carbs), show-day rice cakes + honey.",
    extractedJson: { confidence: "medium", source_quote: "calories drop to 1900, carbs 90g, protein stays 210g, fat 45g" },
  });

  // ---- 35 days of health data -----------------------------------------------
  const nutritionRows: (typeof nutritionEntries.$inferInsert)[] = [];
  const weightRows: (typeof weightEntries.$inferInsert)[] = [];
  const hydrationRows: (typeof hydrationEntries.$inferInsert)[] = [];
  const sleepRows: (typeof sleepSessions.$inferInsert)[] = [];
  const workoutRows: (typeof workouts.$inferInsert)[] = [];

  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
    const progress = i / (DAYS - 1);

    // Weight: 196 → ~188.5 with daily noise; skip ~1 morning a week.
    if (rand() > 0.12) {
      const w = 196 - 7.5 * progress + between(-0.9, 0.9);
      const time = at(date, 6, 45);
      weightRows.push({
        hcUid: `seed-weight-${date}`,
        source: "samsung_health",
        measuredAt: new Date(time),
        localDate: localDateOf(time, TZ),
        weightLbs: Math.round(w * 10) / 10,
      });
    }

    // Nutrition: 4 meal summaries/day; Saturdays tend to run hot.
    const cheatFactor = dow === 6 && rand() < 0.5 ? between(1.1, 1.22) : 1;
    const dayCal = 2100 * cheatFactor * between(0.96, 1.04);
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
        const protein = 210 * share * between(0.9, 1.1) * (cheatFactor > 1 ? 0.95 : 1);
        const carbs = 185 * share * cheatFactor * between(0.85, 1.15);
        const fat = Math.max(
          8,
          (cal - protein * 4 - carbs * 4) / 9 + between(-2, 2),
        );
        const time = at(date, mealHours[meal]);
        nutritionRows.push({
          hcUid: `seed-nutrition-${date}-${meal}`,
          source: "myfitnesspal",
          localDate: localDateOf(time, TZ),
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
        hcUid: `seed-hydration-${date}-${n}`,
        source: "samsung_health",
        localDate: localDateOf(time, TZ),
        volumeMl: Math.round(total * share),
      });
    }

    // Sleep: 6.1–8.1h ending this morning.
    const hours = between(6.1, 8.1);
    const wake = at(date, 6, 15);
    const bed = new Date(new Date(wake).getTime() - hours * 3600_000);
    sleepRows.push({
      hcUid: `seed-sleep-${date}`,
      source: "samsung_health",
      localDate: localDateOf(wake, TZ),
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
        hcUid: `seed-lift-${date}`,
        source: "samsung_health",
        localDate: localDateOf(startT, TZ),
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
        hcUid: `seed-cardio-${date}`,
        source: "samsung_health",
        localDate: localDateOf(startT, TZ),
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

  console.log(
    `Seeded: ${nutritionRows.length} meals, ${weightRows.length} weigh-ins, ${hydrationRows.length} hydration, ${sleepRows.length} sleep, ${workoutRows.length} workouts.`,
  );
  console.log("Settings: NPC Iron Coast Classic, 73 days out, target 187 lbs @ 5'8\" (cap 187).");
  console.log("Protocols: 1 active (2100 kcal), 1 pending peak-week extraction to review.");

  // SEED_AI=1 pre-populates the demo with real AI output: document embeddings
  // (so doc chat works immediately), the current week's plain-language
  // analysis, and a filled-in coach check-in draft. Requires ANTHROPIC_API_KEY
  // and VOYAGE_API_KEY. Skipped by default so local seeding stays fast/offline.
  if (process.env.SEED_AI === "1") {
    await populateAiContent(today);
  } else {
    console.log("(Set SEED_AI=1 to also embed docs + generate analysis/draft.)");
  }

  process.exit(0);
}

async function populateAiContent(today: string) {
  const db = await getDb();
  console.log("\nSEED_AI: generating demo AI content…");

  // 1) Embed every document so doc chat is ready (Voyage free-tier friendly:
  //    embeddings.ts backs off on 429s).
  const docs = await db.select().from(documents);
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
  const settingsRow = await getSettings();
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
    .values({ weekStart, ...manual, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: checkIns.weekStart,
      set: { ...manual, updatedAt: new Date() },
    });

  try {
    const stats = await weekStats(weekStart);
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
      .where(eq(checkIns.weekStart, weekStart));
    console.log("  generated weekly analysis + check-in draft.");
  } catch (err) {
    console.warn(`  analysis/draft failed: ${err instanceof Error ? err.message : err}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
