import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { accounts, getDb, weightEntries } from "../lib/db";
import { createSessionToken, deleteAccount, hashPasscode, SESSION_COOKIE } from "../lib/auth";
import { todayLocal } from "../lib/dates";
import { GET } from "../app/api/clients/[accountId]/dashboard/route";
import { createAccountTracker } from "./helpers";

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

function requestWithSession(role: "coach" | "client" | null) {
  const headers: Record<string, string> = {};
  if (role) {
    const token = createSessionToken({ accountId: 1, role });
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  return new NextRequest("http://localhost/api/clients/1/dashboard", { headers });
}

function ctxFor(accountId: number) {
  return { params: Promise.resolve({ accountId: String(accountId) }) };
}

test("GET /api/clients/[accountId]/dashboard 401s with no session", async () => {
  const res = await GET(requestWithSession(null), ctxFor(1));
  assert.equal(res.status, 401);
});

test("GET /api/clients/[accountId]/dashboard 403s a client session", async () => {
  const res = await GET(requestWithSession("client"), ctxFor(1));
  assert.equal(res.status, 403);
});

test("GET /api/clients/[accountId]/dashboard returns the target client's scoped data", async () => {
  const { id: clientId } = await makeAccount("Clients Dashboard Route Test Client");
  const db = await getDb();
  const today = todayLocal();
  await db.insert(weightEntries).values({
    accountId: clientId,
    hcUid: "clients-dashboard-route-weight",
    measuredAt: new Date(`${today}T14:00:00Z`),
    localDate: today,
    weightLbs: 172,
  });

  const res = await GET(requestWithSession("coach"), ctxFor(clientId));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.account.id, clientId);
  assert.ok(json.dashboard.weightSeries.some((w: { weightLbs: number }) => w.weightLbs === 172));
});

test("GET /api/clients/[accountId]/dashboard 404s for a nonexistent account", async () => {
  const res = await GET(requestWithSession("coach"), ctxFor(999999));
  assert.equal(res.status, 404);
});

test("GET /api/clients/[accountId]/dashboard 404s for a coach account (not a client)", async () => {
  const db = await getDb();
  const passcodeHash = await hashPasscode("clients-dashboard-route-other-coach");
  const [otherCoach] = await db
    .insert(accounts)
    .values({ name: "Clients Dashboard Route Test Other Coach", role: "coach", passcodeHash })
    .returning();

  try {
    const res = await GET(requestWithSession("coach"), ctxFor(otherCoach.id));
    assert.equal(res.status, 404);
  } finally {
    await deleteAccount(otherCoach.id);
  }
});
