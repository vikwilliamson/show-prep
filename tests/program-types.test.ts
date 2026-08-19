import assert from "node:assert/strict";
import { test } from "vitest";
import { PROGRAM_TYPES, programTypeLabel } from "../lib/program-types";

test("PROGRAM_TYPES lists the three generalized coaching program types", () => {
  assert.deepEqual(PROGRAM_TYPES, ["physique_prep", "weight_loss", "general_coaching"]);
});

test("programTypeLabel maps known values to display labels", () => {
  assert.equal(programTypeLabel("physique_prep"), "Physique Prep");
  assert.equal(programTypeLabel("weight_loss"), "Weight Loss");
  assert.equal(programTypeLabel("general_coaching"), "General Coaching");
});

test("programTypeLabel falls back to a humanized string for unknown values", () => {
  assert.equal(programTypeLabel("some_custom_type"), "some custom type");
});
