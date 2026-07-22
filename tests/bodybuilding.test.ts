import assert from "node:assert/strict";
import { test } from "node:test";
import { BODYBUILDING_WEIGHT_CLASSES, bodybuildingWeightClass } from "../lib/bodybuilding";

test("chart matches the official NPC 6-class anchors", () => {
  assert.equal(bodybuildingWeightClass(143.25).label, "Bantamweight");
  assert.equal(bodybuildingWeightClass(154.25).label, "Lightweight");
  assert.equal(bodybuildingWeightClass(176.25).label, "Middleweight");
  assert.equal(bodybuildingWeightClass(198.25).label, "Light Heavyweight");
  assert.equal(bodybuildingWeightClass(225.25).label, "Heavyweight");
  assert.equal(bodybuildingWeightClass(300).label, "Super Heavyweight");
});

test("weights just over a boundary bump to the next class", () => {
  assert.equal(bodybuildingWeightClass(143.3).label, "Lightweight");
  assert.equal(bodybuildingWeightClass(225.3).label, "Super Heavyweight");
});

test("toNextClassLbs counts up to the next boundary, null at the top", () => {
  assert.equal(bodybuildingWeightClass(140).toNextClassLbs, 3.3); // 143.25 - 140, rounded to 1 decimal
  assert.equal(bodybuildingWeightClass(300).toNextClassLbs, null);
});

test("chart is monotonically increasing", () => {
  for (let i = 1; i < BODYBUILDING_WEIGHT_CLASSES.length; i++) {
    assert.ok(
      BODYBUILDING_WEIGHT_CLASSES[i].maxWeightLbs >
        BODYBUILDING_WEIGHT_CLASSES[i - 1].maxWeightLbs,
    );
  }
});

test("invalid weights throw", () => {
  assert.throws(() => bodybuildingWeightClass(0));
  assert.throws(() => bodybuildingWeightClass(-5));
  assert.throws(() => bodybuildingWeightClass(NaN));
});
