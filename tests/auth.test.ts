import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createSessionToken,
  getCurrentAccount,
  hashPasscode,
  requireCoach,
  verifyPasscode,
  verifySessionToken,
} from "../lib/auth";

test("a passcode verifies against its own hash", async () => {
  const hash = await hashPasscode("elk-basalt-7");
  assert.equal(await verifyPasscode("elk-basalt-7", hash), true);
});

test("the wrong passcode fails verification", async () => {
  const hash = await hashPasscode("elk-basalt-7");
  assert.equal(await verifyPasscode("wrong-passcode", hash), false);
});

test("a session token round-trips to the same payload", () => {
  const token = createSessionToken({ accountId: 7, role: "client" });
  assert.deepEqual(verifySessionToken(token), { accountId: 7, role: "client" });
});

test("a tampered token fails verification", () => {
  const token = createSessionToken({ accountId: 7, role: "client" });
  const tampered = token.slice(0, -1) + (token.at(-1) === "a" ? "b" : "a");
  assert.equal(verifySessionToken(tampered), null);
});

test("an expired token fails verification", () => {
  const token = createSessionToken({ accountId: 7, role: "client" }, { ttlMs: -1 });
  assert.equal(verifySessionToken(token), null);
});

test("getCurrentAccount returns null with no cookie", () => {
  assert.equal(getCurrentAccount(undefined), null);
});

test("getCurrentAccount returns the session for a valid cookie", () => {
  const token = createSessionToken({ accountId: 3, role: "coach" });
  assert.deepEqual(getCurrentAccount(token), { accountId: 3, role: "coach" });
});

test("requireCoach lets a coach through", () => {
  const token = createSessionToken({ accountId: 3, role: "coach" });
  assert.equal(requireCoach(token), null);
});

test("requireCoach 403s a client", async () => {
  const token = createSessionToken({ accountId: 7, role: "client" });
  const res = requireCoach(token);
  assert.ok(res);
  assert.equal(res.status, 403);
});

test("requireCoach 401s with no session", async () => {
  const res = requireCoach(undefined);
  assert.ok(res);
  assert.equal(res.status, 401);
});
