/**
 * Seeds a realistic mid-program dataset so the dashboard and check-in are
 * demonstrable before the mobile companion has synced anything. Seeds two
 * accounts: the demo coach (self-coaching, reachable via the portfolio demo
 * login) and a demo client underneath it, so the coach dashboard's client
 * list has a real client to open.
 *
 * Run with the dev server STOPPED (PGlite is single-process):
 *   pnpm seed
 *
 * Idempotent: health rows upsert on deterministic seed hc_uids; documents,
 * protocols and settings are refreshed each run.
 */
import {
  findOrCreateAccount,
  populateAiContent,
  seedAccountData,
  SEED_DAYS,
  type SeedAccountConfig,
} from "../lib/seed-data";

// The demo login (app/login) advertises NEXT_PUBLIC_DEMO_PASSWORD as a
// one-click credential when set — reuse it here so seeded data is reachable
// through that same account out of the box.
const COACH_CONFIG: SeedAccountConfig = {
  name: "Demo Coach",
  role: "coach",
  passcode: process.env.NEXT_PUBLIC_DEMO_PASSWORD || "demo-coach-passcode",
  targetName: "Summer Physique Shoot",
  targetNote: "first milestone of the year, building toward the next phase",
  programType: "physique_prep",
  targetDateOffsetDays: 73, // ~10.5 weeks out
  targetWeightLbs: 187,
  heightInches: 68,
  startWeightLbs: 196,
  endWeightLbs: 188.5,
  activeCalories: 2100,
  activeProteinG: 210,
  activeCarbsG: 185,
  activeFatG: 55,
  pendingCalories: 1900,
  pendingProteinG: 210,
  pendingCarbsG: 90,
  pendingFatG: 45,
  rngSeed: 20260715,
};

const CLIENT_CONFIG: SeedAccountConfig = {
  name: "Demo Client",
  role: "client",
  passcode: process.env.SEED_CLIENT_PASSCODE || "demo-client-passcode",
  targetName: "Beach Trip Cutoff",
  targetNote: "steady cut, no crash dieting — sustainable pace",
  programType: "weight_loss",
  targetDateOffsetDays: 56, // 8 weeks out
  targetWeightLbs: 178,
  heightInches: 65,
  startWeightLbs: 210,
  endWeightLbs: 200,
  activeCalories: 1800,
  activeProteinG: 165,
  activeCarbsG: 150,
  activeFatG: 55,
  pendingCalories: 1650,
  pendingProteinG: 165,
  pendingCarbsG: 110,
  pendingFatG: 45,
  rngSeed: 20260812,
};

async function seedOne(cfg: SeedAccountConfig): Promise<number> {
  const accountId = await findOrCreateAccount(cfg);
  console.log(`\nSeeding ${SEED_DAYS} days onto account #${accountId} (${cfg.name}, ${cfg.role})…`);
  const summary = await seedAccountData(accountId, cfg);
  console.log(
    `Seeded: ${summary.nutritionCount} meals, ${summary.weightCount} weigh-ins, ${summary.hydrationCount} hydration, ${summary.sleepCount} sleep, ${summary.workoutCount} workouts.`,
  );
  console.log(
    `Settings: ${cfg.targetName}, ${cfg.targetDateOffsetDays} days out, target ${cfg.targetWeightLbs} lbs.`,
  );
  console.log(
    `Protocols: 1 active (${cfg.activeCalories} kcal), 1 pending final-phase extraction to review.`,
  );
  return accountId;
}

async function main() {
  const coachId = await seedOne(COACH_CONFIG);
  const clientId = await seedOne(CLIENT_CONFIG);

  // SEED_AI=1 pre-populates both accounts with real AI output: document
  // embeddings (so doc chat works immediately), the current week's
  // plain-language analysis, and a filled-in coach check-in draft. Requires
  // ANTHROPIC_API_KEY and VOYAGE_API_KEY. Skipped by default so local
  // seeding stays fast/offline.
  if (process.env.SEED_AI === "1") {
    for (const [label, accountId] of [
      ["coach", coachId],
      ["client", clientId],
    ] as const) {
      console.log(`\nSEED_AI: generating demo AI content for ${label}…`);
      await populateAiContent(accountId);
    }
  } else {
    console.log("\n(Set SEED_AI=1 to also embed docs + generate analysis/draft, for both accounts.)");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
