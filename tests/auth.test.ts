import assert from "node:assert/strict";
import { test } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  createSessionToken,
  getAccountByReferenceId,
  getCurrentAccount,
  getPrimaryCoachAccountId,
  hashPasscode,
  requireAccount,
  requireCoach,
  SESSION_COOKIE,
  verifyPasscode,
  verifySessionToken,
} from "../lib/auth";
import { accounts, getDb } from "../lib/db";

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

test("requireAccount returns the session for a request carrying a valid cookie", () => {
  const token = createSessionToken({ accountId: 5, role: "client" });
  const req = new NextRequest("http://localhost/api/settings", {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
  assert.deepEqual(requireAccount(req), { accountId: 5, role: "client" });
});

test("requireAccount 401s a request with no session cookie", () => {
  const req = new NextRequest("http://localhost/api/settings");
  const result = requireAccount(req);
  assert.ok(result instanceof NextResponse);
  assert.equal(result.status, 401);
});

test("requireAccount 401s a request with a tampered cookie", () => {
  const token = createSessionToken({ accountId: 5, role: "client" });
  const req = new NextRequest("http://localhost/api/settings", {
    headers: { cookie: `${SESSION_COOKIE}=${token}x` },
  });
  const result = requireAccount(req);
  assert.ok(result instanceof NextResponse);
  assert.equal(result.status, 401);
});

test("getAccountByReferenceId resolves a known account's referenceId to its accountId", async () => {
  const db = await getDb();
  const passcodeHash = await hashPasscode("reference-id-lookup-test");
  const [row] = await db
    .insert(accounts)
    .values({ name: "Reference Id Lookup Test", role: "client", passcodeHash })
    .returning();
  try {
    const resolved = await getAccountByReferenceId(row.referenceId);
    assert.equal(resolved, row.id);
  } finally {
    await db.delete(accounts).where(eq(accounts.id, row.id));
  }
});

test("getAccountByReferenceId returns null for an unknown referenceId", async () => {
  const resolved = await getAccountByReferenceId("00000000-0000-0000-0000-000000000000");
  assert.equal(resolved, null);
});

test("getPrimaryCoachAccountId resolves to an existing coach account", async () => {
  const db = await getDb();
  const passcodeHash = await hashPasscode("primary-coach-fallback-test");
  const [row] = await db
    .insert(accounts)
    .values({ name: "Primary Coach Fallback Test", role: "coach", passcodeHash })
    .returning();
  try {
    const id = await getPrimaryCoachAccountId();
    const [resolved] = await db.select().from(accounts).where(eq(accounts.id, id));
    assert.equal(resolved.role, "coach");
  } finally {
    await db.delete(accounts).where(eq(accounts.id, row.id));
  }
});
