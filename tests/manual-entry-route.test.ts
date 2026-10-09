import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  dailyActivity,
  getDb,
  hydrationEntries,
  sleepSessions,
  weightEntries,
} from "../lib/db";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
import { addDays, todayLocal } from "../lib/dates";
import { dailyWeights } from "../lib/stats";
import { POST } from "../app/api/manual-entry/route";
import { createAccountTracker } from "./helpers";

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

function post(accountId: number | null, role: "coach" | "client", body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accountId !== null) {
    headers.cookie = `${SESSION_COOKIE}=${createSessionToken({ accountId, role })}`;
  }
  return POST(
    new NextRequest("http://localhost/api/manual-entry", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

const DATE = addDays(todayLocal(), -2);

async function rowsFor(accountId: number) {
  const db = await getDb();
  const [weights, sleeps, hydration, activity] = await Promise.all([
    db.select().from(weightEntries).where(eq(weightEntries.accountId, accountId)),
    db.select().from(sleepSessions).where(eq(sleepSessions.accountId, accountId)),
    db.select().from(hydrationEntries).where(eq(hydrationEntries.accountId, accountId)),
    db.select().from(dailyActivity).where(eq(dailyActivity.accountId, accountId)),
  ]);
  return { weights, sleeps, hydration, activity };
}

test("POST /api/manual-entry 401s with no session", async () => {
  const res = await post(null, "client", { date: DATE, weightLbs: 180 });
  assert.equal(res.status, 401);
});

test("a client's entry lands in each table with source 'manual' and their own account_id", async () => {
  const { id } = await makeAccount("Manual Entry Client");
  const res = await post(id, "client", {
    date: DATE,
    weightLbs: 181.4,
    sleepHours: 7.5,
    waterMl: 3200,
    steps: 9100,
    activeCalories: 450,
    totalCalories: 2600,
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json.saved.sort(), ["activity", "hydration", "sleep", "weight"]);

  const { weights, sleeps, hydration, activity } = await rowsFor(id);
  assert.equal(weights.length, 1);
  assert.equal(weights[0].source, "manual");
  assert.equal(weights[0].localDate, DATE);
  assert.equal(weights[0].weightLbs, 181.4);
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0].source, "manual");
  assert.equal(sleeps[0].localDate, DATE);
  assert.equal(sleeps[0].durationMin, 450);
  assert.equal(
    sleeps[0].endedAt.getTime() - sleeps[0].startedAt.getTime(),
    450 * 60_000,
  );
  assert.equal(hydration.length, 1);
  assert.equal(hydration[0].source, "manual");
  assert.equal(hydration[0].volumeMl, 3200);
  assert.equal(activity.length, 1);
  assert.equal(activity[0].source, "manual");
  assert.equal(activity[0].steps, 9100);
  assert.equal(activity[0].activeCalories, 450);
  assert.equal(activity[0].totalCalories, 2600);
});

test("only the fields provided are written", async () => {
  const { id } = await makeAccount("Manual Entry Partial");
  const res = await post(id, "client", { date: DATE, waterMl: 2500 });
  assert.equal(res.status, 200);
  const { weights, sleeps, hydration, activity } = await rowsFor(id);
  assert.equal(hydration.length, 1);
  assert.equal(weights.length + sleeps.length + activity.length, 0);
});

test("date defaults to today in the account's timezone", async () => {
  const { id } = await makeAccount("Manual Entry Default Date");
  const res = await post(id, "client", { waterMl: 1000 });
  assert.equal(res.status, 200);
  const { hydration } = await rowsFor(id);
  assert.equal(hydration[0].localDate, todayLocal());
});

test("resubmitting the same day corrects the entry instead of duplicating it", async () => {
  const { id } = await makeAccount("Manual Entry Resubmit");
  await post(id, "client", { date: DATE, weightLbs: 190, sleepHours: 6, waterMl: 2000, steps: 5000 });
  await post(id, "client", { date: DATE, weightLbs: 188.5, sleepHours: 8, waterMl: 2800, steps: 7000 });

  const { weights, sleeps, hydration, activity } = await rowsFor(id);
  assert.equal(weights.length, 1);
  assert.equal(weights[0].weightLbs, 188.5);
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0].durationMin, 480);
  assert.equal(hydration.length, 1);
  assert.equal(hydration[0].volumeMl, 2800);
  assert.equal(activity.length, 1);
  assert.equal(activity[0].steps, 7000);
});

test("a manual weight shows up in the dashboard's weight series", async () => {
  const { id } = await makeAccount("Manual Entry Reads Back");
  await post(id, "client", { date: DATE, weightLbs: 175 });
  const series = await dailyWeights(id, DATE, DATE);
  assert.deepEqual(series, [{ date: DATE, weightLbs: 175 }]);
});

test("a manual activity entry overwrites a synced row for the same day, but only the fields provided", async () => {
  const { id } = await makeAccount("Manual Entry Overwrites Synced");
  const db = await getDb();
  await db.insert(dailyActivity).values({
    accountId: id,
    hcUid: "activity-synced",
    source: "health_connect",
    localDate: DATE,
    steps: 4000,
    activeCalories: 300,
    totalCalories: 2400,
  });

  const res = await post(id, "client", { date: DATE, steps: 8000 });
  assert.equal(res.status, 200);

  const rows = await db
    .select()
    .from(dailyActivity)
    .where(and(eq(dailyActivity.accountId, id), eq(dailyActivity.localDate, DATE)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].steps, 8000);
  assert.equal(rows[0].activeCalories, 300);
  assert.equal(rows[0].totalCalories, 2400);
  assert.equal(rows[0].source, "manual");
});

test("422s when no measurement is provided", async () => {
  const { id } = await makeAccount("Manual Entry Empty");
  assert.equal((await post(id, "client", {})).status, 422);
  assert.equal((await post(id, "client", { date: DATE })).status, 422);
});

test("422s on a malformed date, a future date, out-of-range values, and unknown keys", async () => {
  const { id } = await makeAccount("Manual Entry Invalid");
  const bad: unknown[] = [
    { date: "07/14/2026", weightLbs: 180 },
    { date: addDays(todayLocal(), 2), weightLbs: 180 },
    { date: DATE, weightLbs: 0 },
    { date: DATE, weightLbs: -5 },
    { date: DATE, sleepHours: 0 },
    { date: DATE, sleepHours: 25 },
    { date: DATE, waterMl: -1 },
    { date: DATE, waterMl: 50_000 },
    { date: DATE, steps: 1.5 },
    { date: DATE, steps: 500_000 },
    { date: DATE, activeCalories: -1 },
    { date: DATE, weightLbs: 180, source: "health_connect" },
  ];
  for (const body of bad) {
    const res = await post(id, "client", body);
    assert.equal(res.status, 422, JSON.stringify(body));
  }
  const { weights } = await rowsFor(id);
  assert.equal(weights.length, 0);
});

test("a client can't write to another account", async () => {
  const { id: a } = await makeAccount("Manual Entry Client A");
  const { id: b } = await makeAccount("Manual Entry Client B");
  const res = await post(a, "client", { accountId: b, date: DATE, weightLbs: 180 });
  assert.equal(res.status, 403);
  assert.equal((await rowsFor(b)).weights.length, 0);
});

test("a coach can enter data for one of their clients, and only the targeted client gets it", async () => {
  const { id: coach } = await makeAccount("Manual Entry Coach", { role: "coach" });
  const { id: clientA } = await makeAccount("Manual Entry Coach Target");
  const { id: clientB } = await makeAccount("Manual Entry Coach Bystander");
  const res = await post(coach, "coach", { accountId: clientA, date: DATE, weightLbs: 160 });
  assert.equal(res.status, 200);
  assert.equal((await rowsFor(clientA)).weights.length, 1);
  assert.equal((await rowsFor(clientB)).weights.length, 0);
  assert.equal((await rowsFor(coach)).weights.length, 0);
});

test("a coach gets 404 for a nonexistent account or another coach's account", async () => {
  const { id: coach } = await makeAccount("Manual Entry Coach 404", { role: "coach" });
  const { id: otherCoach } = await makeAccount("Manual Entry Other Coach", { role: "coach" });
  assert.equal(
    (await post(coach, "coach", { accountId: 999999, date: DATE, weightLbs: 160 })).status,
    404,
  );
  assert.equal(
    (await post(coach, "coach", { accountId: otherCoach, date: DATE, weightLbs: 160 })).status,
    404,
  );
});
