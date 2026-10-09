import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { Webhook } from "svix";
import {
  dailyActivity,
  getDb,
  hydrationEntries,
  sleepSessions,
  syncLog,
  webhookDeliveries,
  weightEntries,
  workouts,
} from "@/lib/db";
import { getAccountByAggregatorUserId } from "@/lib/auth";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/stats";
import { normalizeWebhookEvent, parseWebhookEvent } from "@/lib/health-webhook/normalize";

// POST /api/health-webhook — receiver for the health-data aggregator's
// (currently Open Wearables, delivering via Svix) outgoing webhooks.
// specs/phase-2-open-wearables.md §1.
//
// Auth is the Svix signature, verified over the RAW body — never re-serialize
// it first. No signing secret configured -> 503, not open (the route is
// outside the session gate in proxy.ts, so there's nothing else in front of
// it).
//
// Idempotency has two layers: the Svix message ID (`svix-id`, stable across
// Svix's own retries) is recorded in the SAME transaction as the records it
// delivered, so a delivery that fails midway leaves no ledger row and its
// retry is processed rather than dropped; and every record upserts on its
// account-scoped provider_uid, which covers duplicates within or across
// payloads.

const WEBHOOK_DEVICE_ID = "health-webhook";

/** Last occurrence wins — a multi-row upsert can't touch the same key twice. */
function dedupeBy<T>(rows: T[], key: (row: T) => string): T[] {
  return [...new Map(rows.map((r) => [key(r), r])).values()];
}

export async function POST(req: NextRequest) {
  const secret = env.healthWebhookSecret;
  if (!secret) {
    return NextResponse.json({ error: "Webhook receiver is not configured" }, { status: 503 });
  }

  const raw = await req.text();
  const messageId = req.headers.get("svix-id") ?? "";
  try {
    new Webhook(secret).verify(raw, {
      "svix-id": messageId,
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = parseWebhookEvent(body);
  if (event.status === "ignored") {
    return NextResponse.json({ ok: true, ignored: true });
  }
  if (event.status === "invalid") {
    return NextResponse.json({ error: "Invalid payload", issues: event.issues }, { status: 422 });
  }

  // Webhooks identify users only by the aggregator's own user ID. Reject, never
  // fall back to a default account, on one we can't resolve.
  const accountId = await getAccountByAggregatorUserId(event.userId);
  if (accountId === null) {
    console.warn(`health-webhook: unknown aggregator user for ${event.type} (message ${messageId})`);
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }

  const { timezone } = await getSettings(accountId);
  const rows = normalizeWebhookEvent(event, timezone);
  const weights = dedupeBy(rows.weights, (r) => r.providerUid);
  const hydration = dedupeBy(rows.hydration, (r) => r.providerUid);
  const sleep = dedupeBy(rows.sleep, (r) => r.providerUid);
  const sessions = dedupeBy(rows.workouts, (r) => r.providerUid);
  const accepted = weights.length + hydration.length + sleep.length + sessions.length + rows.activity.length;

  const db = await getDb();
  const duplicate = await db.transaction(async (tx) => {
    const claimed = await tx
      .insert(webhookDeliveries)
      .values({ messageId, accountId, eventType: event.type })
      .onConflictDoNothing()
      .returning();
    if (claimed.length === 0) return true;

    if (weights.length > 0) {
      await tx
        .insert(weightEntries)
        .values(weights.map((r) => ({ accountId, ...r })))
        .onConflictDoUpdate({
          target: [weightEntries.accountId, weightEntries.providerUid],
          set: {
            source: sql`excluded.source`,
            measuredAt: sql`excluded.measured_at`,
            localDate: sql`excluded.local_date`,
            weightLbs: sql`excluded.weight_lbs`,
          },
        });
    }
    if (hydration.length > 0) {
      await tx
        .insert(hydrationEntries)
        .values(hydration.map((r) => ({ accountId, ...r })))
        .onConflictDoUpdate({
          target: [hydrationEntries.accountId, hydrationEntries.providerUid],
          set: {
            source: sql`excluded.source`,
            localDate: sql`excluded.local_date`,
            volumeMl: sql`excluded.volume_ml`,
          },
        });
    }
    if (sleep.length > 0) {
      await tx
        .insert(sleepSessions)
        .values(sleep.map((r) => ({ accountId, ...r })))
        .onConflictDoUpdate({
          target: [sleepSessions.accountId, sleepSessions.providerUid],
          set: {
            source: sql`excluded.source`,
            localDate: sql`excluded.local_date`,
            startedAt: sql`excluded.started_at`,
            endedAt: sql`excluded.ended_at`,
            durationMin: sql`excluded.duration_min`,
            stages: sql`excluded.stages`,
          },
        });
    }
    if (sessions.length > 0) {
      await tx
        .insert(workouts)
        .values(sessions.map((r) => ({ accountId, ...r })))
        .onConflictDoUpdate({
          target: [workouts.accountId, workouts.providerUid],
          set: {
            source: sql`excluded.source`,
            localDate: sql`excluded.local_date`,
            startedAt: sql`excluded.started_at`,
            endedAt: sql`excluded.ended_at`,
            exerciseType: sql`excluded.exercise_type`,
            isCardio: sql`excluded.is_cardio`,
            caloriesBurned: sql`excluded.calories_burned`,
          },
        });
    }

    // daily_activity is one row per (account, day) shared by steps and
    // calories batches, so each upsert sets only the fields its batch carried.
    for (const day of rows.activity) {
      const { localDate, source, ...fields } = day;
      const providerUid = `activity-${localDate}`;
      await tx
        .insert(dailyActivity)
        .values({ accountId, providerUid, source, localDate, ...fields })
        .onConflictDoUpdate({
          target: [dailyActivity.accountId, dailyActivity.localDate],
          set: { providerUid, source, ...fields },
        });
    }

    await tx.insert(syncLog).values({
      accountId,
      deviceId: WEBHOOK_DEVICE_ID,
      recordCount: accepted + rows.skipped,
      acceptedCount: accepted,
      rejectedCount: rows.skipped,
      status: "ok",
    });
    return false;
  });

  if (duplicate) return NextResponse.json({ ok: true, duplicate: true });
  return NextResponse.json({ ok: true, accepted, skipped: rows.skipped });
}
