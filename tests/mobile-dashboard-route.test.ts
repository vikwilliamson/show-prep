import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { getDb, protocols, settings, weightEntries } from "../lib/db";
import { todayLocal } from "../lib/dates";
import { getSettings } from "../lib/stats";
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
  assert.equal(json.dashboard.latestWeight.weightLbs, 180);
});

test("GET /api/mobile/dashboard trims the response to the fields the companion app consumes", async () => {
  const account = await makeAccount("Mobile Dashboard Route Test Client Trim");
  const res = await GET(requestWithReferenceId(account.referenceId));
  assert.equal(res.status, 200);
  const json = await res.json();

  // Full dashboardData()/weekStats() payloads (90-day weightSeries/
  // weightTrend, 13-day compliance, per-day water/sleep/training arrays,
  // raw settings/protocol rows) are far more than the mobile screen shows —
  // only a summary should cross the wire.
  assert.deepEqual(Object.keys(json.dashboard).sort(), [
    "daysToTarget",
    "latestWeight",
    "nutritionTarget",
    "settings",
    "weeklyChangeLbs",
  ]);
  assert.deepEqual(Object.keys(json.dashboard.settings).sort(), [
    "targetDate",
    "targetName",
    "targetWeightLbs",
  ]);
  assert.deepEqual(Object.keys(json.stats).sort(), ["sleep", "training", "water"]);
  assert.deepEqual(Object.keys(json.stats.water).sort(), [
    "avgLiters",
    "daysLogged",
    "daysMet",
    "targetLiters",
  ]);
  assert.deepEqual(Object.keys(json.stats.sleep).sort(), [
    "avgHours",
    "nightsLogged",
    "nightsMet",
    "targetHours",
  ]);
  assert.deepEqual(Object.keys(json.stats.training).sort(), [
    "cardioCount",
    "cardioTarget",
    "strengthCount",
    "strengthTarget",
  ]);
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
  assert.notEqual(json.dashboard.latestWeight?.weightLbs, 999, "must not leak another account's data");
});

test("GET /api/mobile/dashboard returns a null nutritionTarget when there's no active protocol and no manual target", async () => {
  const account = await makeAccount("Mobile Dashboard Route Test No Target");
  const res = await GET(requestWithReferenceId(account.referenceId));
  const json = await res.json();
  assert.equal(json.dashboard.nutritionTarget, null);
});

test("GET /api/mobile/dashboard falls back to the manual settings target when there's no active protocol", async () => {
  const account = await makeAccount("Mobile Dashboard Route Test Manual Target");
  const db = await getDb();
  await getSettings(account.id); // bootstraps the default row so UPDATE has one to match
  await db
    .update(settings)
    .set({ targetCalories: 2200, targetProteinG: 180, targetCarbsG: 220, targetFatG: 70 })
    .where(eq(settings.accountId, account.id));

  const res = await GET(requestWithReferenceId(account.referenceId));
  const json = await res.json();
  assert.deepEqual(json.dashboard.nutritionTarget, {
    calories: 2200,
    proteinG: 180,
    carbsG: 220,
    fatG: 70,
    source: "manual",
    effectiveFrom: null,
  });
});

test("GET /api/mobile/dashboard prefers the active protocol's macros over a manual target when both exist", async () => {
  const account = await makeAccount("Mobile Dashboard Route Test Protocol Wins");
  const db = await getDb();
  await getSettings(account.id); // bootstraps the default row so UPDATE has one to match
  await db
    .update(settings)
    .set({ targetCalories: 2200, targetProteinG: 180, targetCarbsG: 220, targetFatG: 70 })
    .where(eq(settings.accountId, account.id));
  await db.insert(protocols).values({
    accountId: account.id,
    status: "active",
    effectiveFrom: "2026-01-01",
    calories: 2100,
    proteinG: 210,
    carbsG: 185,
    fatG: 55,
  });

  const res = await GET(requestWithReferenceId(account.referenceId));
  const json = await res.json();
  assert.deepEqual(json.dashboard.nutritionTarget, {
    calories: 2100,
    proteinG: 210,
    carbsG: 185,
    fatG: 55,
    source: "protocol",
    effectiveFrom: "2026-01-01",
  });
});
