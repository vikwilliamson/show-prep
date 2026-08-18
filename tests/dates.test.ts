import assert from "node:assert/strict";
import { test } from "vitest";
import {
  addDays,
  daysBetween,
  localDateOf,
  mondayOf,
  weekDates,
} from "../lib/dates";

test("localDateOf buckets by LA timezone", () => {
  // 2026-07-15T03:00Z is still 2026-07-14 in LA (UTC-7 in July).
  assert.equal(localDateOf("2026-07-15T03:00:00Z"), "2026-07-14");
  assert.equal(localDateOf("2026-07-15T08:00:00Z"), "2026-07-15");
  // Winter (UTC-8): 07:59Z is previous day.
  assert.equal(localDateOf("2026-01-10T07:59:00Z"), "2026-01-09");
  assert.equal(localDateOf("2026-01-10T08:01:00Z"), "2026-01-10");
});

test("localDateOf respects other timezones", () => {
  assert.equal(localDateOf("2026-07-15T03:00:00Z", "UTC"), "2026-07-15");
});

test("mondayOf", () => {
  assert.equal(mondayOf("2026-07-15"), "2026-07-13"); // Wednesday → Monday
  assert.equal(mondayOf("2026-07-13"), "2026-07-13"); // Monday → itself
  assert.equal(mondayOf("2026-07-19"), "2026-07-13"); // Sunday → previous Monday
});

test("weekDates returns Mon..Sun", () => {
  const dates = weekDates("2026-07-13");
  assert.equal(dates.length, 7);
  assert.equal(dates[0], "2026-07-13");
  assert.equal(dates[6], "2026-07-19");
});

test("addDays handles month boundaries", () => {
  assert.equal(addDays("2026-07-31", 1), "2026-08-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("daysBetween", () => {
  assert.equal(daysBetween("2026-07-15", "2026-09-26"), 73);
  assert.equal(daysBetween("2026-07-15", "2026-07-15"), 0);
  assert.equal(daysBetween("2026-07-15", "2026-07-14"), -1);
});
