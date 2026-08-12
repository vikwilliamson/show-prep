import assert from "node:assert/strict";
import { test } from "node:test";
import {
  invertExerciseTypes,
  mapActivity,
  mapExercise,
  mapHydration,
  mapNutrition,
  mapSleep,
  mapWeight,
} from "../src/mapper";

// mapper.ts is pure (raw Health Connect record shapes -> ingest wire contract),
// so these need no mocks. See lib/ingest/schemas.ts for the server side.

test("mapNutrition maps meal types and drops zero-energy rows", () => {
  const out = mapNutrition([
    {
      metadata: { id: "n1" },
      startTime: "2026-08-01T15:00:00Z",
      mealType: 1,
      energy: { inKilocalories: 520 },
      protein: { inGrams: 42 },
      totalCarbohydrate: { inGrams: 55 },
      totalFat: { inGrams: 14 },
      dietaryFiber: { inGrams: 6 },
      sugar: { inGrams: 8 },
      sodium: { inMilligrams: 300 },
      saturatedFat: { inGrams: 4 },
    },
    // Custom MFP meal name -> UNKNOWN (0) -> "other".
    {
      metadata: { id: "n2" },
      startTime: "2026-08-01T19:00:00Z",
      mealType: 0,
      energy: { inKilocalories: 300 },
    },
    // Zero-energy summary is dropped entirely.
    {
      metadata: { id: "n3" },
      startTime: "2026-08-01T21:00:00Z",
      mealType: 4,
      energy: { inKilocalories: 0 },
    },
  ]);

  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    hcUid: "n1",
    startTime: "2026-08-01T15:00:00Z",
    mealType: "breakfast",
    calories: 520,
    proteinG: 42,
    carbsG: 55,
    fatG: 14,
    fiberG: 6,
    sugarG: 8,
    sodiumMg: 300,
    saturatedFatG: 4,
  });
  // Missing optionals become null, missing macros default to 0.
  assert.deepEqual(out[1], {
    hcUid: "n2",
    startTime: "2026-08-01T19:00:00Z",
    mealType: "other",
    calories: 300,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    saturatedFatG: null,
  });
});

test("mapNutrition falls back to 'other' for unknown meal codes", () => {
  const [row] = mapNutrition([
    {
      metadata: { id: "n" },
      startTime: "t",
      mealType: 99,
      energy: { inKilocalories: 1 },
    },
  ]);
  assert.equal(row.mealType, "other");
});

test("mapWeight passes kilograms straight through", () => {
  const out = mapWeight([
    { metadata: { id: "w1" }, time: "2026-08-01T13:45:00Z", weight: { inKilograms: 88.4 } },
  ]);
  assert.deepEqual(out, [{ hcUid: "w1", time: "2026-08-01T13:45:00Z", weightKg: 88.4 }]);
});

test("mapHydration converts liters to milliliters", () => {
  const out = mapHydration([
    { metadata: { id: "h1" }, startTime: "t", volume: { inLiters: 0.5 } },
    { metadata: { id: "h2" }, startTime: "t2" }, // missing volume -> 0
  ]);
  assert.equal(out[0].volumeMl, 500);
  assert.equal(out[1].volumeMl, 0);
});

test("mapSleep maps stages and tolerates missing stages", () => {
  const out = mapSleep([
    {
      metadata: { id: "s1" },
      startTime: "2026-08-01T05:00:00Z",
      endTime: "2026-08-01T13:00:00Z",
      stages: [{ stage: 4, startTime: "a", endTime: "b" }],
    },
    { metadata: { id: "s2" }, startTime: "x", endTime: "y" },
  ]);
  assert.deepEqual(out[0].stages, [{ stage: "4", startTime: "a", endTime: "b" }]);
  assert.equal(out[1].stages, null);
});

test("mapExercise resolves names and falls back to 'workout'", () => {
  const names = { 79: "walking", 71: "strength_training" };
  const out = mapExercise(
    [
      { metadata: { id: "e1" }, startTime: "t", endTime: "t2", exerciseType: 79, title: "Morning walk" },
      { metadata: { id: "e2" }, startTime: "t3", exerciseType: 12345 }, // unknown -> workout, null endTime/title
    ],
    names,
  );
  assert.deepEqual(out[0], {
    hcUid: "e1",
    startTime: "t",
    endTime: "t2",
    exerciseType: "walking",
    title: "Morning walk",
  });
  assert.deepEqual(out[1], {
    hcUid: "e2",
    startTime: "t3",
    endTime: null,
    exerciseType: "workout",
    title: null,
  });
});

test("invertExerciseTypes lowercases names keyed by numeric value", () => {
  assert.deepEqual(
    invertExerciseTypes({ WALKING: 79, STRENGTH_TRAINING: 71 }),
    { 79: "walking", 71: "strength_training" },
  );
});

test("mapActivity aggregates steps + calories into one row per local day", () => {
  const steps = [
    { startTime: "2026-08-01T15:00:00Z", count: 4000 },
    { startTime: "2026-08-01T23:00:00Z", count: 3000 },
    { startTime: "2026-08-02T16:00:00Z", count: 5000 },
  ];
  const calories = [
    { startTime: "2026-08-01T15:00:00Z", energy: { inKilocalories: 1200.4 } },
    { startTime: "2026-08-02T16:00:00Z", energy: { inKilocalories: 1100.6 } },
  ];
  const out = mapActivity(steps, calories, "America/Los_Angeles");

  const aug1 = out.find((r) => r.date === "2026-08-01");
  const aug2 = out.find((r) => r.date === "2026-08-02");
  assert.ok(aug1 && aug2);
  assert.equal(aug1.hcUid, "activity-2026-08-01");
  assert.equal(aug1.steps, 7000);
  assert.equal(aug1.totalCalories, 1200); // rounded
  assert.equal(aug2.steps, 5000);
  assert.equal(aug2.totalCalories, 1101);
});

test("mapActivity buckets by the supplied timezone", () => {
  // 2026-08-02T02:00:00Z is 2026-08-01 in LA (UTC-7) but 2026-08-02 in UTC.
  const steps = [{ startTime: "2026-08-02T02:00:00Z", count: 1000 }];
  const la = mapActivity(steps, [], "America/Los_Angeles");
  const utc = mapActivity(steps, [], "UTC");
  assert.equal(la[0].date, "2026-08-01");
  assert.equal(utc[0].date, "2026-08-02");
});

test("mapActivity emits null (not 0) for a day with no counts", () => {
  const out = mapActivity([{ startTime: "2026-08-01T15:00:00Z", count: 0 }], [], "UTC");
  assert.equal(out[0].steps, null);
  assert.equal(out[0].totalCalories, null);
});
