import assert from "node:assert/strict";
import { test } from "vitest";
import { settingsPutSchema } from "../lib/settings-schema";

test("accepts an empty body and partial settings/targets", () => {
  assert.ok(settingsPutSchema.safeParse({}).success);
  assert.ok(
    settingsPutSchema.safeParse({
      settings: { targetDate: "2027-03-01", targetWeightLbs: 165.5, targetCalories: 2100 },
      targets: { waterMlMin: 3500 },
    }).success,
  );
});

test("accepts null to clear nullable settings", () => {
  assert.ok(
    settingsPutSchema.safeParse({ settings: { targetDate: null, targetCalories: null } }).success,
  );
});

test("rejects a malformed date, non-positive calories/weight, and unknown program type", () => {
  assert.equal(settingsPutSchema.safeParse({ settings: { targetDate: "03/01/2027" } }).success, false);
  assert.equal(settingsPutSchema.safeParse({ settings: { targetCalories: -5 } }).success, false);
  assert.equal(settingsPutSchema.safeParse({ settings: { targetWeightLbs: 0 } }).success, false);
  assert.equal(settingsPutSchema.safeParse({ settings: { programType: "peak_week" } }).success, false);
});

test("rejects non-integer calories and negative macros", () => {
  assert.equal(settingsPutSchema.safeParse({ settings: { targetCalories: 2000.5 } }).success, false);
  assert.equal(settingsPutSchema.safeParse({ settings: { targetProteinG: -1 } }).success, false);
});
