import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { accounts, getDb, settings, weeklyTargets } from "../lib/db";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
import { getSettings } from "../lib/stats";
import { GET, PUT } from "../app/api/settings/route";
import { createAccountTracker } from "./helpers";

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

function requestWithSession(
  method: "GET" | "PUT",
  accountId: number,
  body?: unknown,
) {
  const token = createSessionToken({ accountId, role: "client" });
  return new NextRequest("http://localhost/api/settings", {
    method,
    headers: {
      cookie: `${SESSION_COOKIE}=${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("GET /api/settings 401s with no session", async () => {
  const res = await GET(new NextRequest("http://localhost/api/settings"));
  assert.equal(res.status, 401);
});

test("GET /api/settings returns a default row for a brand-new account", async () => {
  const { id: a } = await makeAccount("Settings Route Test New");
  const res = await GET(requestWithSession("GET", a));
  const json = await res.json();
  assert.equal(json.settings.accountId, a);
  assert.equal(json.targets.accountId, a);
});

test("GET /api/settings returns the caller's role", async () => {
  const { id: a } = await makeAccount("Settings Route Test Role");
  const res = await GET(requestWithSession("GET", a));
  const json = await res.json();
  assert.equal(json.role, "client");
});

test("GET /api/settings returns the caller's own companion referenceId", async () => {
  const { id: a } = await makeAccount("Settings Route Test ReferenceId");
  const db = await getDb();
  const [row] = await db.select().from(accounts).where(eq(accounts.id, a));

  const res = await GET(requestWithSession("GET", a));
  const json = await res.json();

  assert.equal(json.referenceId, row.referenceId);
});

test("PUT /api/settings only ever updates the caller's own row", async () => {
  const { id: a } = await makeAccount("Settings Route Test Owner");
  const { id: b } = await makeAccount("Settings Route Test Other");

  const putRes = await PUT(
    requestWithSession("PUT", a, {
      settings: { targetName: "Owner's target" },
    }),
  );
  assert.equal(putRes.status, 200);

  const bRes = await GET(requestWithSession("GET", b));
  const bJson = await bRes.json();
  assert.equal(bJson.settings.targetName, null);

  const aRes = await GET(requestWithSession("GET", a));
  const aJson = await aRes.json();
  assert.equal(aJson.settings.targetName, "Owner's target");
});

test("PUT /api/settings accepts and persists the four manual macro target fields, scoped to the caller's account", async () => {
  const { id: a } = await makeAccount("Settings Route Test Macros");
  const putRes = await PUT(
    requestWithSession("PUT", a, {
      settings: {
        targetCalories: 2200,
        targetProteinG: 180,
        targetCarbsG: 220,
        targetFatG: 70,
      },
    }),
  );
  assert.equal(putRes.status, 200);
  const putJson = await putRes.json();
  assert.equal(putJson.settings.targetCalories, 2200);
  assert.equal(putJson.settings.targetProteinG, 180);
  assert.equal(putJson.settings.targetCarbsG, 220);
  assert.equal(putJson.settings.targetFatG, 70);

  const db = await getDb();
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.accountId, a));
  assert.equal(row.targetCalories, 2200);
});

test("settings UPDATE only matches a row when both id and accountId agree, matching the WHERE clause PUT /api/settings uses", async () => {
  // Regression test for the write's own WHERE clause (VIK-96), not just the
  // fact that PUT /api/settings's upstream read is account-scoped: this uses
  // the exact `and(eq(id), eq(accountId))` shape the route applies, with a
  // deliberately mismatched id/accountId pair, to prove the accountId half
  // of the condition actually does work rather than being redundant with the
  // row id (which is already globally unique).
  const { id: a } = await makeAccount("Settings Scoping Test A");
  const { id: b } = await makeAccount("Settings Scoping Test B");
  const rowA = await getSettings(a);
  await getSettings(b);
  const db = await getDb();

  const updated = await db
    .update(settings)
    .set({ targetName: "should never apply" })
    .where(and(eq(settings.id, rowA.id), eq(settings.accountId, b)))
    .returning();
  assert.equal(
    updated.length,
    0,
    "a mismatched id/accountId pair must match zero rows",
  );

  const [stillA] = await db
    .select()
    .from(settings)
    .where(eq(settings.accountId, a));
  assert.notEqual(stillA.targetName, "should never apply");
});

test("PUT /api/settings updates the caller's own weekly targets", async () => {
  const { id: a } = await makeAccount("Settings Route Test Targets");
  const res = await PUT(
    requestWithSession("PUT", a, { targets: { waterMlMin: 4000 } }),
  );
  const json = await res.json();
  assert.equal(json.targets.waterMlMin, 4000);

  const db = await getDb();
  const [row] = await db
    .select()
    .from(weeklyTargets)
    .where(eq(weeklyTargets.accountId, a));
  assert.equal(row.waterMlMin, 4000);
});

test("PUT /api/settings accepts and persists a valid checkinTemplate, and GET reflects it", async () => {
  const { id: a } = await makeAccount("Settings Route Test Checkin Template");
  const template = [
    { key: "sleep_quality", question: "How was your sleep?", type: "manual" },
    {
      key: "bodyweight",
      question: "Current bodyweight?",
      type: "mixed",
      note: "From Health Connect, manually confirmed.",
    },
  ];

  const putRes = await PUT(
    requestWithSession("PUT", a, { settings: { checkinTemplate: template } }),
  );
  assert.equal(putRes.status, 200);
  const putJson = await putRes.json();
  assert.deepEqual(putJson.settings.checkinTemplate, template);

  const getRes = await GET(requestWithSession("GET", a));
  const getJson = await getRes.json();
  assert.deepEqual(getJson.settings.checkinTemplate, template);
});

test("PUT /api/settings rejects a checkinTemplate entry missing question", async () => {
  const { id: a } = await makeAccount(
    "Settings Route Test Checkin Template Invalid",
  );
  const res = await PUT(
    requestWithSession("PUT", a, {
      settings: { checkinTemplate: [{ key: "sleep_quality", type: "manual" }] },
    }),
  );
  assert.equal(res.status, 422);
});

test("PUT /api/settings rejects a checkinTemplate entry with an invalid type", async () => {
  const { id: a } = await makeAccount(
    "Settings Route Test Checkin Template Bad Type",
  );
  const res = await PUT(
    requestWithSession("PUT", a, {
      settings: {
        checkinTemplate: [
          { key: "sleep_quality", question: "How was your sleep?", type: "ai" },
        ],
      },
    }),
  );
  assert.equal(res.status, 422);
});
