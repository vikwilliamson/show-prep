import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import { checkRateLimit, resetRateLimit } from "../lib/rate-limit";

beforeEach(() => {
  resetRateLimit();
});

afterEach(() => {
  resetRateLimit();
});

test("allows requests under the limit", () => {
  const opts = { windowMs: 60_000, max: 3 };
  assert.equal(checkRateLimit("a", opts), true);
  assert.equal(checkRateLimit("a", opts), true);
  assert.equal(checkRateLimit("a", opts), true);
});

test("blocks the request once the limit is hit within the window", () => {
  const opts = { windowMs: 60_000, max: 3 };
  checkRateLimit("a", opts);
  checkRateLimit("a", opts);
  checkRateLimit("a", opts);
  assert.equal(checkRateLimit("a", opts), false);
});

test("tracks each key independently", () => {
  const opts = { windowMs: 60_000, max: 1 };
  assert.equal(checkRateLimit("a", opts), true);
  assert.equal(checkRateLimit("a", opts), false);
  assert.equal(checkRateLimit("b", opts), true);
});

test("resets the count once the window elapses", async () => {
  const opts = { windowMs: 20, max: 1 };
  assert.equal(checkRateLimit("a", opts), true);
  assert.equal(checkRateLimit("a", opts), false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(checkRateLimit("a", opts), true);
});

test("resetRateLimit(key) clears only that key", () => {
  const opts = { windowMs: 60_000, max: 1 };
  checkRateLimit("a", opts);
  checkRateLimit("b", opts);
  resetRateLimit("a");
  assert.equal(checkRateLimit("a", opts), true);
  assert.equal(checkRateLimit("b", opts), false);
});
