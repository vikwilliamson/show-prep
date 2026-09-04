import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  createSessionToken,
  deleteAccount,
  generatePasscode,
  getAccountByReferenceId,
  getAccountReferenceId,
  getClientAccount,
  getCurrentAccount,
  getPrimaryCoachAccountId,
  hashPasscode,
  listClientAccounts,
  listClientsNeedingBrief,
  requireAccount,
  requireCoach,
  SESSION_COOKIE,
  verifyPasscode,
  verifySessionToken,
} from "../lib/auth";
import { accounts, coachBriefs, documents, getDb } from "../lib/db";
import { DEFAULT_TIMEZONE, mondayOf, todayLocal } from "../lib/dates";
import { createAccountTracker } from "./helpers";

const CURRENT_WEEK_START = mondayOf(todayLocal(DEFAULT_TIMEZONE));

const { makeAccount, cleanup: cleanupAccounts } = createAccountTracker();
afterEach(cleanupAccounts);

test("generatePasscode returns passcodes of the expected shape", () => {
  const passcode = generatePasscode();
  assert.match(passcode, /^[a-z0-9]{4,}-[a-z0-9]{4,}$/);
});

test("generatePasscode doesn't repeat across calls", () => {
  const seen = new Set(Array.from({ length: 20 }, () => generatePasscode()));
  assert.equal(seen.size, 20);
});

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

test("getAccountReferenceId returns a known account's referenceId", async () => {
  const db = await getDb();
  const passcodeHash = await hashPasscode("get-reference-id-test");
  const [row] = await db
    .insert(accounts)
    .values({ name: "Get Reference Id Test", role: "client", passcodeHash })
    .returning();
  try {
    assert.equal(await getAccountReferenceId(row.id), row.referenceId);
  } finally {
    await db.delete(accounts).where(eq(accounts.id, row.id));
  }
});

test("getAccountReferenceId returns null for an unknown accountId", async () => {
  assert.equal(await getAccountReferenceId(-1), null);
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

test("deleteAccount removes the account and cascades to its data", async () => {
  const db = await getDb();
  const passcodeHash = await hashPasscode("delete-account-test");
  const [account] = await db
    .insert(accounts)
    .values({ name: "Delete Account Test", role: "client", passcodeHash })
    .returning();
  const [doc] = await db
    .insert(documents)
    .values({ accountId: account.id, title: "t", sourceType: "txt", contentText: "c" })
    .returning();

  const deleted = await deleteAccount(account.id);
  assert.equal(deleted, true);

  const [remainingAccount] = await db.select().from(accounts).where(eq(accounts.id, account.id));
  assert.equal(remainingAccount, undefined);
  const [remainingDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
  assert.equal(remainingDoc, undefined);
});

test("deleteAccount returns false for an account that doesn't exist", async () => {
  const deleted = await deleteAccount(-1);
  assert.equal(deleted, false);
});

test("listClientAccounts returns only client accounts", async () => {
  const { id: clientId } = await makeAccount("List Client Accounts Test Client");
  const db = await getDb();
  const passcodeHash = await hashPasscode("list-client-accounts-coach");
  const [coach] = await db
    .insert(accounts)
    .values({ name: "List Client Accounts Test Coach", role: "coach", passcodeHash })
    .returning();

  try {
    const clients = await listClientAccounts();
    const ids = clients.map((c) => c.id);
    assert.ok(ids.includes(clientId));
    assert.ok(!ids.includes(coach.id));
  } finally {
    await deleteAccount(coach.id);
  }
});

test("listClientsNeedingBrief includes a client with no coach_briefs row for the current week", async () => {
  const { id: clientId } = await makeAccount("Needs Brief Test Client A");

  const needing = await listClientsNeedingBrief();
  assert.ok(needing.some((c) => c.id === clientId));
});

test("listClientsNeedingBrief excludes a client with a draft brief for the current week", async () => {
  const { id: clientId } = await makeAccount("Needs Brief Test Client B");
  const db = await getDb();
  await db.insert(coachBriefs).values({
    accountId: clientId,
    weekStart: CURRENT_WEEK_START,
    status: "draft",
    content: "draft content",
  });

  const needing = await listClientsNeedingBrief();
  assert.ok(!needing.some((c) => c.id === clientId), "an existing draft counts as handled");
});

test("listClientsNeedingBrief excludes a client with an approved brief for the current week", async () => {
  const { id: clientId } = await makeAccount("Needs Brief Test Client C");
  const db = await getDb();
  await db.insert(coachBriefs).values({
    accountId: clientId,
    weekStart: CURRENT_WEEK_START,
    status: "approved",
    content: "approved content",
    approvedAt: new Date(),
  });

  const needing = await listClientsNeedingBrief();
  assert.ok(!needing.some((c) => c.id === clientId));
});

test("listClientsNeedingBrief still includes a client whose only brief is for a prior week", async () => {
  const { id: clientId } = await makeAccount("Needs Brief Test Client D");
  const db = await getDb();
  const staleWeekStart = mondayOf("2020-01-06"); // long-past Monday
  await db.insert(coachBriefs).values({
    accountId: clientId,
    weekStart: staleWeekStart,
    status: "approved",
    content: "old content",
    approvedAt: new Date(),
  });

  const needing = await listClientsNeedingBrief();
  assert.ok(needing.some((c) => c.id === clientId), "a stale prior-week brief doesn't stop the nudge");
});

test("getClientAccount returns the account for a real client", async () => {
  const { id: clientId } = await makeAccount("Get Client Account Test");
  const found = await getClientAccount(clientId);
  assert.equal(found?.id, clientId);
});

test("getClientAccount returns null for a coach account", async () => {
  const db = await getDb();
  const passcodeHash = await hashPasscode("get-client-account-coach");
  const [coach] = await db
    .insert(accounts)
    .values({ name: "Get Client Account Test Coach", role: "coach", passcodeHash })
    .returning();

  try {
    assert.equal(await getClientAccount(coach.id), null);
  } finally {
    await deleteAccount(coach.id);
  }
});

test("getClientAccount returns null for a nonexistent id", async () => {
  assert.equal(await getClientAccount(-1), null);
});
