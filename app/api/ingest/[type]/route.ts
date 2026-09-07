import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import {
  dailyActivity,
  getDb,
  hydrationEntries,
  nutritionEntries,
  sleepSessions,
  syncLog,
  weightEntries,
  workouts,
} from "@/lib/db";
import { localDateOf } from "@/lib/dates";
import { checkIngestAuth } from "@/lib/ingest/auth";
import {
  activityRecord,
  batchSchema,
  exerciseRecord,
  hydrationRecord,
  isCardioType,
  nutritionRecord,
  sleepRecord,
  weightRecord,
  type IngestType,
} from "@/lib/ingest/schemas";
import { getAccountByReferenceId } from "@/lib/auth";
import { getSettings } from "@/lib/stats";

// POST /api/ingest/{nutrition|weight|hydration|sleep|exercise|activity}
// Batched, Zod-validated, idempotent: upserts on the Health Connect UID.

const KG_TO_LBS = 2.2046226218;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ type: string }> },
) {
  const denied = checkIngestAuth(req);
  if (denied) return denied;

  const { type } = await ctx.params;
  if (!(type in { nutrition: 1, weight: 1, hydration: 1, sleep: 1, exercise: 1, activity: 1 })) {
    return NextResponse.json({ error: `Unknown ingest type: ${type}` }, { status: 404 });
  }
  const ingestType = type as IngestType;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = batchSchema(ingestType).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  const { deviceId, referenceId, source, records } = parsed.data;
  const accountId = await getAccountByReferenceId(referenceId);
  if (accountId === null) {
    return NextResponse.json({ error: "Unknown referenceId" }, { status: 401 });
  }

  const db = await getDb();
  const tz = (await getSettings(accountId)).timezone;
  let accepted = 0;

  try {
    for (const r of records) {
      // Each case only defines what's unique to that record type — the
      // shared insert/upsert boilerplate lives once, below the switch.
      let table: AnyPgTable;
      let target: AnyPgColumn[];
      let values: Record<string, unknown>;

      switch (ingestType) {
        case "nutrition": {
          const rec = r as z.infer<typeof nutritionRecord>;
          table = nutritionEntries;
          target = [nutritionEntries.accountId, nutritionEntries.hcUid];
          values = {
            accountId,
            hcUid: rec.hcUid,
            source,
            localDate: localDateOf(rec.startTime, tz),
            mealType: rec.mealType,
            calories: rec.calories,
            proteinG: rec.proteinG,
            carbsG: rec.carbsG,
            fatG: rec.fatG,
            fiberG: rec.fiberG ?? null,
            sugarG: rec.sugarG ?? null,
            sodiumMg: rec.sodiumMg ?? null,
            saturatedFatG: rec.saturatedFatG ?? null,
          };
          break;
        }
        case "weight": {
          const rec = r as z.infer<typeof weightRecord>;
          table = weightEntries;
          target = [weightEntries.accountId, weightEntries.hcUid];
          values = {
            accountId,
            hcUid: rec.hcUid,
            source,
            measuredAt: new Date(rec.time),
            localDate: localDateOf(rec.time, tz),
            weightLbs: Math.round(rec.weightKg * KG_TO_LBS * 10) / 10,
            bodyFatPct: rec.bodyFatPct ?? null,
          };
          break;
        }
        case "hydration": {
          const rec = r as z.infer<typeof hydrationRecord>;
          table = hydrationEntries;
          target = [hydrationEntries.accountId, hydrationEntries.hcUid];
          values = {
            accountId,
            hcUid: rec.hcUid,
            source,
            localDate: localDateOf(rec.startTime, tz),
            volumeMl: rec.volumeMl,
          };
          break;
        }
        case "sleep": {
          const rec = r as z.infer<typeof sleepRecord>;
          const start = new Date(rec.startTime);
          const end = new Date(rec.endTime);
          table = sleepSessions;
          target = [sleepSessions.accountId, sleepSessions.hcUid];
          values = {
            accountId,
            hcUid: rec.hcUid,
            source,
            // A night's sleep is attributed to the wake-up date.
            localDate: localDateOf(end, tz),
            startedAt: start,
            endedAt: end,
            durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
            stages: rec.stages ?? null,
          };
          break;
        }
        case "exercise": {
          const rec = r as z.infer<typeof exerciseRecord>;
          table = workouts;
          target = [workouts.accountId, workouts.hcUid];
          values = {
            accountId,
            hcUid: rec.hcUid,
            source,
            localDate: localDateOf(rec.startTime, tz),
            startedAt: new Date(rec.startTime),
            endedAt: rec.endTime ? new Date(rec.endTime) : null,
            exerciseType: rec.exerciseType,
            isCardio: rec.isCardio ?? isCardioType(rec.exerciseType),
            caloriesBurned: rec.caloriesBurned ?? null,
            title: rec.title ?? null,
          };
          break;
        }
        case "activity": {
          const rec = r as z.infer<typeof activityRecord>;
          table = dailyActivity;
          // The unique constraint is on (account_id, local_date) — one row
          // per account per day, not on hc_uid. Upsert on that composite so
          // re-syncing the same day overwrites rather than conflicting.
          target = [dailyActivity.accountId, dailyActivity.localDate];
          values = {
            accountId,
            hcUid: rec.hcUid,
            source,
            localDate: rec.date,
            steps: rec.steps ?? null,
            activeCalories: rec.activeCalories ?? null,
            totalCalories: rec.totalCalories ?? null,
          };
          break;
        }
      }

      await db
        .insert(table)
        .values(values)
        .onConflictDoUpdate({ target, set: values });
      accepted++;
    }

    await db.insert(syncLog).values({
      accountId,
      deviceId,
      recordCount: records.length,
      acceptedCount: accepted,
      rejectedCount: records.length - accepted,
      status: "ok",
    });

    return NextResponse.json({ ok: true, type: ingestType, accepted });
  } catch (err) {
    await db
      .insert(syncLog)
      .values({
        accountId,
        deviceId,
        recordCount: records.length,
        acceptedCount: accepted,
        rejectedCount: records.length - accepted,
        status: `error: ${err instanceof Error ? err.message : String(err)}`,
      })
      .catch(() => {});
    throw err;
  }
}
