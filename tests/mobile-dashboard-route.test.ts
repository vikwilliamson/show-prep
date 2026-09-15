import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { getDb, weightEntries } from "../lib/db";
import { todayLocal } from "../lib/dates";
import { GET } from "../app/api/mobile/dashboard/route";
import { createAccountTracker } from "./helpers";

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

function requestWithReferenceId(referenceId: string | null) {
  const url = referenceId
    ? `http://localhost/api/mobile/dashboard?referenceId=${referenceId}`
    : "http://localhost/api/mobile/dashboard";
  return new NextRequest(url);
}

test("GET /api/mobile/dashboard 400s with no referenceId", async () => {
  const res = await GET(requestWithReferenceId(null));
  assert.equal(res.status, 400);
});

test("GET /api/mobile/dashboard 401s for an unknown referenceId", async () => {
  const res = await GET(requestWithReferenceId("00000000-0000-0000-0000-000000000000"));
  assert.equal(res.status, 401);
});

test("GET /api/mobile/dashboard returns the referenceId-resolved account's scoped data", async () => {
  const account = await makeAccount("Mobile Dashboard Route Test Client");
  const db = await getDb();
  const today = todayLocal();
  await db.insert(weightEntries).values({
    accountId: account.id,
    hcUid: "mobile-dashboard-route-weight",
    measuredAt: new Date(`${today}T14:00:00Z`),
    localDate: today,
    weightLbs: 180,
  });

  const res = await GET(requestWithReferenceId(account.referenceId));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(
    json.dashboard.weightSeries.some((w: { weightLbs: number }) => w.weightLbs === 180),
  );
});

test("GET /api/mobile/dashboard scopes stats/weekStats to the resolved account only", async () => {
  const a = await makeAccount("Mobile Dashboard Route Test Client A");
  const b = await makeAccount("Mobile Dashboard Route Test Client B");
  const db = await getDb();
  const today = todayLocal();
  await db.insert(weightEntries).values({
    accountId: b.id,
    hcUid: "mobile-dashboard-route-weight-b",
    measuredAt: new Date(`${today}T14:00:00Z`),
    localDate: today,
    weightLbs: 999,
  });

  const res = await GET(requestWithReferenceId(a.referenceId));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(
    !json.dashboard.weightSeries.some((w: { weightLbs: number }) => w.weightLbs === 999),
    "must not leak another account's data",
  );
});
