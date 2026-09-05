import assert from "node:assert/strict";
import { test } from "vitest";
import { batchSchema } from "../lib/ingest/schemas";

const REF_ID = "00000000-0000-0000-0000-000000000000";

function batch(type: Parameters<typeof batchSchema>[0], records: unknown[]) {
  return batchSchema(type).safeParse({
    deviceId: "test-device",
    referenceId: REF_ID,
    records,
  });
}

test("weightKg above the plausible-human-body-weight bound is rejected", () => {
  const ok = batch("weight", [{ hcUid: "a", time: "2026-08-19T12:00:00.000Z", weightKg: 150 }]);
  assert.equal(ok.success, true);

  const tooHigh = batch("weight", [
    { hcUid: "a", time: "2026-08-19T12:00:00.000Z", weightKg: 1e12 },
  ]);
  assert.equal(tooHigh.success, false);
});

test("hydration volumeMl above the plausible single-record bound is rejected", () => {
  const tooHigh = batch("hydration", [
    { hcUid: "a", startTime: "2026-08-19T12:00:00.000Z", volumeMl: 1e12 },
  ]);
  assert.equal(tooHigh.success, false);
});

test("exercise caloriesBurned above the plausible bound is rejected", () => {
  const tooHigh = batch("exercise", [
    { hcUid: "a", startTime: "2026-08-19T12:00:00.000Z", caloriesBurned: 1e12 },
  ]);
  assert.equal(tooHigh.success, false);
});

test("exercise title and exerciseType have length caps", () => {
  const longTitle = batch("exercise", [
    { hcUid: "a", startTime: "2026-08-19T12:00:00.000Z", title: "x".repeat(10_000) },
  ]);
  assert.equal(longTitle.success, false);

  const longType = batch("exercise", [
    {
      hcUid: "a",
      startTime: "2026-08-19T12:00:00.000Z",
      exerciseType: "x".repeat(10_000),
    },
  ]);
  assert.equal(longType.success, false);
});

test("sleep stage strings have a length cap", () => {
  const longStage = batch("sleep", [
    {
      hcUid: "a",
      startTime: "2026-08-19T02:00:00.000Z",
      endTime: "2026-08-19T10:00:00.000Z",
      stages: [
        {
          stage: "x".repeat(10_000),
          startTime: "2026-08-19T02:00:00.000Z",
          endTime: "2026-08-19T03:00:00.000Z",
        },
      ],
    },
  ]);
  assert.equal(longStage.success, false);
});

test("activity steps/calories above plausible daily bounds are rejected", () => {
  const tooManySteps = batch("activity", [{ hcUid: "a", date: "2026-08-19", steps: 1e12 }]);
  assert.equal(tooManySteps.success, false);

  const tooManyCalories = batch("activity", [
    { hcUid: "a", date: "2026-08-19", activeCalories: 1e12 },
  ]);
  assert.equal(tooManyCalories.success, false);
});

test("an empty records array is rejected", () => {
  const empty = batch("nutrition", []);
  assert.equal(empty.success, false);
});
