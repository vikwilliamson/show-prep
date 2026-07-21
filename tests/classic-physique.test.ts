import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLASSIC_PHYSIQUE_CHART,
  classicPhysiqueWeightCap,
  formatHeight,
} from "../lib/classic-physique";

test("chart matches the official NPC anchors", () => {
  assert.equal(classicPhysiqueWeightCap(64).maxWeightLbs, 167); // 5'4"
  assert.equal(classicPhysiqueWeightCap(67).maxWeightLbs, 182); // 5'7"
  assert.equal(classicPhysiqueWeightCap(70).maxWeightLbs, 202); // 5'10"
  assert.equal(classicPhysiqueWeightCap(72).maxWeightLbs, 217); // 6'0"
  assert.equal(classicPhysiqueWeightCap(79).maxWeightLbs, 267); // 6'7"
});

test("heights below the first bracket use the 5'4\" cap", () => {
  assert.equal(classicPhysiqueWeightCap(60).maxWeightLbs, 167);
});

test("fractional heights round up to the next bracket", () => {
  assert.equal(classicPhysiqueWeightCap(70.5).maxWeightLbs, 209); // between 5'10" and 5'11"
  assert.equal(classicPhysiqueWeightCap(68.0).maxWeightLbs, 187); // exactly 5'8" stays 5'8"
});

test("over 6'7\" uses the top cap", () => {
  assert.equal(classicPhysiqueWeightCap(80).maxWeightLbs, 274);
  assert.equal(classicPhysiqueWeightCap(90).maxWeightLbs, 274);
});

test("chart is monotonically increasing", () => {
  for (let i = 1; i < CLASSIC_PHYSIQUE_CHART.length; i++) {
    assert.ok(
      CLASSIC_PHYSIQUE_CHART[i].maxWeightLbs >
        CLASSIC_PHYSIQUE_CHART[i - 1].maxWeightLbs,
    );
  }
});

test("invalid heights throw", () => {
  assert.throws(() => classicPhysiqueWeightCap(0));
  assert.throws(() => classicPhysiqueWeightCap(-5));
  assert.throws(() => classicPhysiqueWeightCap(NaN));
});

test("formatHeight", () => {
  assert.equal(formatHeight(68), `5'8"`);
  assert.equal(formatHeight(72), `6'0"`);
  assert.equal(formatHeight(70.5), `5'10.5"`);
});
