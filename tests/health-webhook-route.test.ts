import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { Webhook } from "svix";
import {
  accounts,
  dailyActivity,
  getDb,
  hydrationEntries,
  settings,
  sleepSessions,
  syncLog,
  webhookDeliveries,
  weightEntries,
  workouts,
} from "../lib/db";
import { POST } from "../app/api/health-webhook/route";
import { getSettings } from "../lib/stats";
import { createAccountTracker } from "./helpers";

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

const SECRET = process.env.HEALTH_WEBHOOK_SECRET as string;

/** Registers an aggregator user for an account, the way the (future)
 *  provisioning flow will, and returns the aggregator-side ID. */
async function linkAggregatorUser(accountId: number): Promise<string> {
  const db = await getDb();
  const aggregatorUserId = randomUUID();
  await db.update(accounts).set({ aggregatorUserId }).where(eq(accounts.id, accountId));
  return aggregatorUserId;
}

function signed(body: unknown, opts: { id?: string; secret?: string; timestamp?: Date; tamper?: boolean } = {}) {
  const id = opts.id ?? `msg_${randomUUID()}`;
  const payload = JSON.stringify(body);
  const timestamp = opts.timestamp ?? new Date();
  const signature = new Webhook(opts.secret ?? SECRET).sign(id, timestamp, payload);
  return {
    id,
    request: new NextRequest("http://localhost/api/health-webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": signature,
      },
      body: opts.tamper ? payload.replace("80", "81") : payload,
    }),
  };
}

const series = (userId: string, type: string, series_type: string, samples: object[], provider = "apple") => ({
  type,
  data: { user_id: userId, provider, series_type, sample_count: samples.length, samples },
});
const sample = (timestamp: string, value: number, unit: string, extra: object = {}) => ({
  timestamp,
  value,
  unit,
  is_daily_total: null,
  ...extra,
});
const sleepEvent = (userId: string, id = "sleep-rec-1") => ({
  type: "sleep.created",
  data: {
    id,
    user_id: userId,
    start_time: "2026-10-01T05:00:00+00:00",
    end_time: "2026-10-01T13:00:00+00:00",
    duration_seconds: 28800,
    source: { provider: "oura", device: null },
    is_nap: false,
  },
});

// --- signature verification ------------------------------------------------

test("a valid signature is accepted", async () => {
  const res = await POST(signed({ type: "connection.created", data: { user_id: randomUUID() } }).request);
  assert.equal(res.status, 200);
});

test("a body signed with the wrong secret is rejected", async () => {
  const other = "whsec_" + Buffer.from("a-completely-different-secret-value").toString("base64");
  const res = await POST(signed({ type: "connection.created", data: {} }, { secret: other }).request);
  assert.equal(res.status, 401);
});

test("a body altered after signing is rejected and writes nothing", async () => {
  const account = await makeAccount("Webhook Tampered Body");
  const uid = await linkAggregatorUser(account.id);
  const body = series(uid, "body_composition.created", "weight", [sample("2026-10-01T14:00:00+00:00", 80, "kg")]);
  const res = await POST(signed(body, { tamper: true }).request);
  assert.equal(res.status, 401);
  const db = await getDb();
  assert.equal((await db.select().from(weightEntries).where(eq(weightEntries.accountId, account.id))).length, 0);
});

test("missing svix headers are rejected", async () => {
  const res = await POST(
    new NextRequest("http://localhost/api/health-webhook", {
      method: "POST",
      body: JSON.stringify({ type: "connection.created", data: {} }),
    }),
  );
  assert.equal(res.status, 401);
});

test("a stale timestamp (replay) is rejected", async () => {
  const res = await POST(
    signed({ type: "connection.created", data: {} }, { timestamp: new Date(Date.now() - 60 * 60 * 1000) }).request,
  );
  assert.equal(res.status, 401);
});

test("fails closed with 503 when no signing secret is configured", async () => {
  vi.resetModules();
  vi.stubEnv("HEALTH_WEBHOOK_SECRET", undefined);
  try {
    const { POST: unconfigured } = await import("../app/api/health-webhook/route");
    const res = await unconfigured(signed({ type: "connection.created", data: {} }).request);
    assert.equal(res.status, 503);
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});

// --- acknowledged-but-not-stored events --------------------------------------

test("events we don't store are acknowledged without needing a known user", async () => {
  const res = await POST(signed({ type: "sync.completed", data: { user_id: randomUUID() } }).request);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ignored, true);
});

test("a handled event type with a malformed payload is rejected, not silently dropped", async () => {
  const account = await makeAccount("Webhook Malformed");
  const uid = await linkAggregatorUser(account.id);
  const { id, request } = signed({ type: "sleep.created", data: { user_id: uid } });
  assert.equal((await POST(request)).status, 422);
  const db = await getDb();
  assert.equal((await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.messageId, id))).length, 0);
});

// --- user -> account resolution ----------------------------------------------

test("an unknown aggregator user is rejected, with nothing written", async () => {
  const { id, request } = signed(sleepEvent(randomUUID()));
  const res = await POST(request);
  assert.equal(res.status, 404);
  const db = await getDb();
  assert.equal((await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.messageId, id))).length, 0);
});

test("an account's referenceId is not accepted as the user identifier", async () => {
  const account = await makeAccount("Webhook Reference Id Is Not User Id");
  const res = await POST(signed(sleepEvent(account.referenceId)).request);
  assert.equal(res.status, 404);
  const db = await getDb();
  assert.equal((await db.select().from(sleepSessions).where(eq(sleepSessions.accountId, account.id))).length, 0);
});

test("two accounts' events land only in their own account, even with identical sample IDs", async () => {
  const a = await makeAccount("Webhook Scope A");
  const b = await makeAccount("Webhook Scope B");
  const ua = await linkAggregatorUser(a.id);
  const ub = await linkAggregatorUser(b.id);
  const samples = [sample("2026-10-01T14:00:00+00:00", 80, "kg")];
  await POST(signed(series(ua, "body_composition.created", "weight", samples)).request);
  await POST(signed(series(ub, "body_composition.created", "weight", [sample("2026-10-01T14:00:00+00:00", 90, "kg")])).request);
  const db = await getDb();
  const rowsA = await db.select().from(weightEntries).where(eq(weightEntries.accountId, a.id));
  const rowsB = await db.select().from(weightEntries).where(eq(weightEntries.accountId, b.id));
  assert.deepEqual(rowsA.map((r) => r.weightLbs), [176.4]);
  assert.deepEqual(rowsB.map((r) => r.weightLbs), [198.4]);
  assert.equal(rowsA[0].providerUid, rowsB[0].providerUid);
});

// --- normalization into each table --------------------------------------------

test("sleep.created lands in sleep_sessions, tagged with the account and source", async () => {
  const account = await makeAccount("Webhook Sleep");
  const uid = await linkAggregatorUser(account.id);
  const res = await POST(signed(sleepEvent(uid)).request);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).accepted, 1);
  const db = await getDb();
  const [row] = await db.select().from(sleepSessions).where(eq(sleepSessions.accountId, account.id));
  assert.equal(row.providerUid, "sleep-rec-1");
  assert.equal(row.source, "open_wearables_oura");
  assert.equal(row.durationMin, 480);
  assert.equal(row.localDate, "2026-10-01");
});

test("the account's own timezone decides the local date", async () => {
  const account = await makeAccount("Webhook Timezone");
  const uid = await linkAggregatorUser(account.id);
  const db = await getDb();
  await getSettings(account.id); // creates the default row
  await db.update(settings).set({ timezone: "Pacific/Auckland" }).where(eq(settings.accountId, account.id));
  await POST(signed(sleepEvent(uid)).request); // ends 13:00Z = 02:00 on 2026-10-02 in Auckland
  const [row] = await db.select().from(sleepSessions).where(eq(sleepSessions.accountId, account.id));
  assert.equal(row.localDate, "2026-10-02");
});

test("workout.created lands in workouts", async () => {
  const account = await makeAccount("Webhook Workout");
  const uid = await linkAggregatorUser(account.id);
  await POST(
    signed({
      type: "workout.created",
      data: {
        id: "wk-1",
        user_id: uid,
        type: "running",
        start_time: "2026-10-01T15:00:00+00:00",
        end_time: "2026-10-01T16:00:00+00:00",
        source: { provider: "garmin", device: null },
        calories_kcal: 450,
      },
    }).request,
  );
  const db = await getDb();
  const [row] = await db.select().from(workouts).where(eq(workouts.accountId, account.id));
  assert.equal(row.exerciseType, "running");
  assert.equal(row.isCardio, true);
  assert.equal(row.caloriesBurned, 450);
  assert.equal(row.source, "open_wearables_garmin");
});

test("a hydration batch lands in hydration_entries", async () => {
  const account = await makeAccount("Webhook Hydration");
  const uid = await linkAggregatorUser(account.id);
  await POST(
    signed(
      series(uid, "activity_timeseries.created", "hydration", [
        sample("2026-10-01T14:00:00+00:00", 500, "ml"),
        sample("2026-10-01T18:00:00+00:00", 250, "ml"),
      ], "google"),
    ).request,
  );
  const db = await getDb();
  const rows = await db.select().from(hydrationEntries).where(eq(hydrationEntries.accountId, account.id));
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((n, r) => n + r.volumeMl, 0), 750);
});

test("daily-total steps and energy for one day merge into a single daily_activity row", async () => {
  const account = await makeAccount("Webhook Activity Merge");
  const uid = await linkAggregatorUser(account.id);
  const total = { is_daily_total: true };
  await POST(signed(series(uid, "steps.created", "steps", [sample("2026-10-01T22:00:00+00:00", 8432, "count", total)])).request);
  await POST(signed(series(uid, "calories.created", "energy", [sample("2026-10-01T22:00:00+00:00", 640, "kcal", total)])).request);
  const db = await getDb();
  const rows = await db.select().from(dailyActivity).where(eq(dailyActivity.accountId, account.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].steps, 8432);
  assert.equal(rows[0].activeCalories, 640);
  assert.equal(rows[0].localDate, "2026-10-01");
});

test("a later steps total for the same day corrects it instead of duplicating, keeping calories", async () => {
  const account = await makeAccount("Webhook Activity Update");
  const uid = await linkAggregatorUser(account.id);
  const total = { is_daily_total: true };
  await POST(signed(series(uid, "calories.created", "energy", [sample("2026-10-01T22:00:00+00:00", 640, "kcal", total)])).request);
  await POST(signed(series(uid, "steps.created", "steps", [sample("2026-10-01T12:00:00+00:00", 4000, "count", total)])).request);
  await POST(signed(series(uid, "steps.created", "steps", [sample("2026-10-01T22:00:00+00:00", 9000, "count", total)])).request);
  const db = await getDb();
  const rows = await db.select().from(dailyActivity).where(eq(dailyActivity.accountId, account.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].steps, 9000);
  assert.equal(rows[0].activeCalories, 640);
});

// --- idempotency ----------------------------------------------------------------

test("message-level: redelivering the same svix-id is a no-op", async () => {
  const account = await makeAccount("Webhook Message Dedup");
  const uid = await linkAggregatorUser(account.id);
  const first = signed(sleepEvent(uid), { id: "msg_dedup_1" });
  assert.equal((await POST(first.request)).status, 200);

  const db = await getDb();
  await db.delete(sleepSessions).where(eq(sleepSessions.accountId, account.id));

  const res = await POST(signed(sleepEvent(uid), { id: "msg_dedup_1" }).request);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).duplicate, true);
  // Skipped entirely: the row we deleted was not re-created.
  assert.equal((await db.select().from(sleepSessions).where(eq(sleepSessions.accountId, account.id))).length, 0);
  assert.equal((await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.accountId, account.id))).length, 1);
});

test("message-level: a delivery that fails midway leaves no ledger row, so Svix's retry is processed", async () => {
  const account = await makeAccount("Webhook Atomic Retry");
  const uid = await linkAggregatorUser(account.id);
  // A duration that overflows the real column makes the sleep insert fail
  // AFTER the delivery was claimed in the same transaction.
  const broken = { ...sleepEvent(uid), data: { ...sleepEvent(uid).data, duration_seconds: 1e41 } };
  await assert.rejects(() => POST(signed(broken, { id: "msg_retry_1" }).request));

  const db = await getDb();
  assert.equal(
    (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.messageId, "msg_retry_1"))).length,
    0,
  );

  const res = await POST(signed(sleepEvent(uid), { id: "msg_retry_1" }).request);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).accepted, 1);
  assert.equal((await db.select().from(sleepSessions).where(eq(sleepSessions.accountId, account.id))).length, 1);
});

test("record-level: the same sample arriving in two different messages doesn't duplicate", async () => {
  const account = await makeAccount("Webhook Record Dedup Across");
  const uid = await linkAggregatorUser(account.id);
  const body = series(uid, "body_composition.created", "weight", [sample("2026-10-01T14:00:00+00:00", 80, "kg")]);
  await POST(signed(body).request);
  await POST(signed(body).request);
  const db = await getDb();
  assert.equal((await db.select().from(weightEntries).where(eq(weightEntries.accountId, account.id))).length, 1);
});

test("record-level: duplicate samples inside one payload don't duplicate or error", async () => {
  const account = await makeAccount("Webhook Record Dedup Within");
  const uid = await linkAggregatorUser(account.id);
  const s = sample("2026-10-01T14:00:00+00:00", 80, "kg");
  const res = await POST(signed(series(uid, "body_composition.created", "weight", [s, s, { ...s, value: 81 }])).request);
  assert.equal(res.status, 200);
  const db = await getDb();
  const rows = await db.select().from(weightEntries).where(eq(weightEntries.accountId, account.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].weightLbs, 178.6); // the last occurrence wins
});

test("receiving both the group and granular event for one batch stores it once", async () => {
  const account = await makeAccount("Webhook Group And Granular");
  const uid = await linkAggregatorUser(account.id);
  const samples = [sample("2026-10-01T14:00:00+00:00", 80, "kg")];
  await POST(signed(series(uid, "body_composition.created", "weight", samples)).request);
  await POST(signed(series(uid, "series.weight.created", "weight", samples)).request);
  const db = await getDb();
  assert.equal((await db.select().from(weightEntries).where(eq(weightEntries.accountId, account.id))).length, 1);
});

test("a stored delivery is recorded in sync_log and the dedup ledger", async () => {
  const account = await makeAccount("Webhook Ledger");
  const uid = await linkAggregatorUser(account.id);
  const { id, request } = signed(sleepEvent(uid));
  await POST(request);
  const db = await getDb();
  const log = await db
    .select()
    .from(syncLog)
    .where(and(eq(syncLog.accountId, account.id), eq(syncLog.deviceId, "health-webhook")));
  assert.equal(log.length, 1);
  assert.equal(log[0].acceptedCount, 1);
  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.messageId, id));
  assert.equal(delivery.accountId, account.id);
  assert.equal(delivery.eventType, "sleep.created");
});
