import { z } from "zod";

// Wire contract for the mobile companion (apps send batched Health Connect
// records). Every record carries the HC stable UID (metadata.id) — the upsert
// key — because syncs overlap by design.

const isoInstant = z.iso.datetime({ offset: true });

export const nutritionRecord = z.object({
  hcUid: z.string().min(1),
  startTime: isoInstant,
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]),
  calories: z.number().nonnegative().max(20_000),
  proteinG: z.number().nonnegative().max(2_000).default(0),
  carbsG: z.number().nonnegative().max(2_000).default(0),
  fatG: z.number().nonnegative().max(2_000).default(0),
  fiberG: z.number().nonnegative().max(2_000).nullish(),
  sugarG: z.number().nonnegative().max(2_000).nullish(),
  sodiumMg: z.number().nonnegative().max(50_000).nullish(),
  saturatedFatG: z.number().nonnegative().max(2_000).nullish(),
});

export const weightRecord = z.object({
  hcUid: z.string().min(1),
  time: isoInstant,
  weightKg: z.number().positive(),
  bodyFatPct: z.number().min(0).max(100).nullish(),
});

export const hydrationRecord = z.object({
  hcUid: z.string().min(1),
  startTime: isoInstant,
  volumeMl: z.number().nonnegative(),
});

export const sleepRecord = z.object({
  hcUid: z.string().min(1),
  startTime: isoInstant,
  endTime: isoInstant,
  stages: z
    .array(
      z.object({ stage: z.string(), startTime: isoInstant, endTime: isoInstant }),
    )
    .nullish(),
});

export const exerciseRecord = z.object({
  hcUid: z.string().min(1),
  startTime: isoInstant,
  endTime: isoInstant.nullish(),
  exerciseType: z.string().default("strength"),
  isCardio: z.boolean().optional(), // derived server-side when omitted
  title: z.string().nullish(),
  caloriesBurned: z.number().nonnegative().nullish(),
});

export const activityRecord = z.object({
  hcUid: z.string().min(1), // e.g. "activity-2026-07-14" from the companion
  date: z.iso.date(),
  steps: z.number().int().nonnegative().nullish(),
  activeCalories: z.number().nonnegative().nullish(),
  totalCalories: z.number().nonnegative().nullish(),
});

export const recordSchemas = {
  nutrition: nutritionRecord,
  weight: weightRecord,
  hydration: hydrationRecord,
  sleep: sleepRecord,
  exercise: exerciseRecord,
  activity: activityRecord,
} as const;

export type IngestType = keyof typeof recordSchemas;

export function batchSchema<T extends IngestType>(type: T) {
  return z.object({
    deviceId: z.string().min(1),
    // The account this batch belongs to — resolved server-side via
    // getAccountByReferenceId(), never trusted as an accountId directly.
    referenceId: z.string().uuid(),
    source: z.enum(["myfitnesspal", "samsung_health", "health_connect", "manual"]).default("health_connect"),
    records: z.array(recordSchemas[type]).max(2000),
  });
}

/** Cardio-ish Health Connect exercise types (subset of ExerciseType constants). */
const CARDIO_TYPES = new Set([
  "biking",
  "biking_stationary",
  "elliptical",
  "hiking",
  "rowing",
  "rowing_machine",
  "running",
  "running_treadmill",
  "stair_climbing",
  "stair_climbing_machine",
  "swimming_open_water",
  "swimming_pool",
  "walking",
]);

export function isCardioType(exerciseType: string): boolean {
  return CARDIO_TYPES.has(exerciseType.toLowerCase());
}
