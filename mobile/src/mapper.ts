// Maps raw Health Connect records to the server's /api/ingest wire contract
// (lib/ingest/schemas.ts in the web app). Key constraints honored here:
//  - MFP writes meal *summaries* (Breakfast/Lunch/Dinner/Snack); custom meal
//    names arrive as "Other" -> mealType "other".
//  - Weight comes from Samsung Health (kg) — sent as weightKg, server converts.
//  - Steps/energy are aggregated into one activity row per local day.

type AnyRecord = Record<string, any>;

const MEAL_TYPES: Record<number, string> = {
  0: "other", // UNKNOWN (custom MFP meal names land here)
  1: "breakfast",
  2: "lunch",
  3: "dinner",
  4: "snack",
};

export function mapNutrition(records: AnyRecord[]) {
  return records
    .filter((r) => r.energy?.inKilocalories > 0)
    .map((r) => ({
      hcUid: r.metadata.id as string,
      startTime: r.startTime as string,
      mealType: MEAL_TYPES[r.mealType as number] ?? "other",
      calories: r.energy?.inKilocalories ?? 0,
      proteinG: r.protein?.inGrams ?? 0,
      carbsG: r.totalCarbohydrate?.inGrams ?? 0,
      fatG: r.totalFat?.inGrams ?? 0,
      fiberG: r.dietaryFiber?.inGrams ?? null,
      sugarG: r.sugar?.inGrams ?? null,
      sodiumMg: r.sodium?.inMilligrams ?? null,
      saturatedFatG: r.saturatedFat?.inGrams ?? null,
    }));
}

export function mapWeight(records: AnyRecord[]) {
  return records.map((r) => ({
    hcUid: r.metadata.id as string,
    time: r.time as string,
    weightKg: r.weight?.inKilograms as number,
  }));
}

export function mapHydration(records: AnyRecord[]) {
  return records.map((r) => ({
    hcUid: r.metadata.id as string,
    startTime: r.startTime as string,
    volumeMl: (r.volume?.inLiters ?? 0) * 1000,
  }));
}

export function mapSleep(records: AnyRecord[]) {
  return records.map((r) => ({
    hcUid: r.metadata.id as string,
    startTime: r.startTime as string,
    endTime: r.endTime as string,
    stages:
      r.stages?.map((s: AnyRecord) => ({
        stage: String(s.stage),
        startTime: s.startTime as string,
        endTime: s.endTime as string,
      })) ?? null,
  }));
}

/**
 * Health Connect exercise types are integers. We resolve names through the
 * library's ExerciseType constants when available and let the server decide
 * what counts as cardio.
 */
export function mapExercise(
  records: AnyRecord[],
  exerciseTypeNames: Record<number, string>,
) {
  return records.map((r) => ({
    hcUid: r.metadata.id as string,
    startTime: r.startTime as string,
    endTime: (r.endTime as string) ?? null,
    exerciseType: exerciseTypeNames[r.exerciseType as number] ?? "workout",
    title: (r.title as string) ?? null,
  }));
}

/** Builds NAME lookup from the library's EXERCISE_TYPE constants object. */
export function invertExerciseTypes(
  constants: Record<string, number>,
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [name, value] of Object.entries(constants)) {
    out[value] = name.toLowerCase();
  }
  return out;
}

/** Aggregates Steps + TotalCaloriesBurned records into one row per local day. */
export function mapActivity(
  steps: AnyRecord[],
  totalCalories: AnyRecord[],
  timeZone: string,
) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const byDay = new Map<string, { steps: number; totalCalories: number }>();
  const dayOf = (iso: string) => fmt.format(new Date(iso));

  for (const r of steps) {
    const day = dayOf(r.startTime);
    const agg = byDay.get(day) ?? { steps: 0, totalCalories: 0 };
    agg.steps += r.count ?? 0;
    byDay.set(day, agg);
  }
  for (const r of totalCalories) {
    const day = dayOf(r.startTime);
    const agg = byDay.get(day) ?? { steps: 0, totalCalories: 0 };
    agg.totalCalories += r.energy?.inKilocalories ?? 0;
    byDay.set(day, agg);
  }

  return [...byDay.entries()].map(([date, agg]) => ({
    hcUid: `activity-${date}`,
    date,
    steps: Math.round(agg.steps) || null,
    totalCalories: Math.round(agg.totalCalories) || null,
  }));
}
