import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
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
import { batchSchema, isCardioType, type IngestType } from "@/lib/ingest/schemas";
import { getPrimaryCoachAccountId } from "@/lib/auth";
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

  const { deviceId, source, records } = parsed.data;
  const db = await getDb();
  // No account concept here yet — this route authenticates by bearer token,
  // not session, and Phase 2 replaces it wholesale with the Terra webhook
  // (which will tag every row with its real account_id via reference_id).
  // Until then it falls back to the sole coach account for timezone lookup
  // only; inserted rows below still don't get account_id set, so freshly
  // synced data won't show up in the now-account-scoped dashboard/stats
  // until Phase 2 lands.
  const tz = (await getSettings(await getPrimaryCoachAccountId())).timezone;
  let accepted = 0;

  try {
    switch (ingestType) {
      case "nutrition": {
        for (const r of records as z.infer<ReturnType<typeof batchSchema<"nutrition">>>["records"]) {
          await db
            .insert(nutritionEntries)
            .values({
              hcUid: r.hcUid,
              source,
              localDate: localDateOf(r.startTime, tz),
              mealType: r.mealType,
              calories: r.calories,
              proteinG: r.proteinG,
              carbsG: r.carbsG,
              fatG: r.fatG,
              fiberG: r.fiberG ?? null,
              sugarG: r.sugarG ?? null,
              sodiumMg: r.sodiumMg ?? null,
              saturatedFatG: r.saturatedFatG ?? null,
            })
            .onConflictDoUpdate({
              target: nutritionEntries.hcUid,
              set: {
                localDate: localDateOf(r.startTime, tz),
                mealType: r.mealType,
                calories: r.calories,
                proteinG: r.proteinG,
                carbsG: r.carbsG,
                fatG: r.fatG,
                fiberG: r.fiberG ?? null,
                sugarG: r.sugarG ?? null,
                sodiumMg: r.sodiumMg ?? null,
                saturatedFatG: r.saturatedFatG ?? null,
              },
            });
          accepted++;
        }
        break;
      }
      case "weight": {
        for (const r of records as z.infer<ReturnType<typeof batchSchema<"weight">>>["records"]) {
          const values = {
            hcUid: r.hcUid,
            source,
            measuredAt: new Date(r.time),
            localDate: localDateOf(r.time, tz),
            weightLbs: Math.round(r.weightKg * KG_TO_LBS * 10) / 10,
            bodyFatPct: r.bodyFatPct ?? null,
          };
          await db
            .insert(weightEntries)
            .values(values)
            .onConflictDoUpdate({ target: weightEntries.hcUid, set: values });
          accepted++;
        }
        break;
      }
      case "hydration": {
        for (const r of records as z.infer<ReturnType<typeof batchSchema<"hydration">>>["records"]) {
          const values = {
            hcUid: r.hcUid,
            source,
            localDate: localDateOf(r.startTime, tz),
            volumeMl: r.volumeMl,
          };
          await db
            .insert(hydrationEntries)
            .values(values)
            .onConflictDoUpdate({ target: hydrationEntries.hcUid, set: values });
          accepted++;
        }
        break;
      }
      case "sleep": {
        for (const r of records as z.infer<ReturnType<typeof batchSchema<"sleep">>>["records"]) {
          const start = new Date(r.startTime);
          const end = new Date(r.endTime);
          const values = {
            hcUid: r.hcUid,
            source,
            // A night's sleep is attributed to the wake-up date.
            localDate: localDateOf(end, tz),
            startedAt: start,
            endedAt: end,
            durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
            stages: r.stages ?? null,
          };
          await db
            .insert(sleepSessions)
            .values(values)
            .onConflictDoUpdate({ target: sleepSessions.hcUid, set: values });
          accepted++;
        }
        break;
      }
      case "exercise": {
        for (const r of records as z.infer<ReturnType<typeof batchSchema<"exercise">>>["records"]) {
          const values = {
            hcUid: r.hcUid,
            source,
            localDate: localDateOf(r.startTime, tz),
            startedAt: new Date(r.startTime),
            endedAt: r.endTime ? new Date(r.endTime) : null,
            exerciseType: r.exerciseType,
            isCardio: r.isCardio ?? isCardioType(r.exerciseType),
            caloriesBurned: r.caloriesBurned ?? null,
            title: r.title ?? null,
          };
          await db
            .insert(workouts)
            .values(values)
            .onConflictDoUpdate({ target: workouts.hcUid, set: values });
          accepted++;
        }
        break;
      }
      case "activity": {
        for (const r of records as z.infer<ReturnType<typeof batchSchema<"activity">>>["records"]) {
          const values = {
            hcUid: r.hcUid,
            source,
            localDate: r.date,
            steps: r.steps ?? null,
            activeCalories: r.activeCalories ?? null,
            totalCalories: r.totalCalories ?? null,
          };
          // The unique constraint is on local_date (one row per day), not on
          // hc_uid. Upsert on local_date so re-syncing the same day overwrites
          // rather than conflicting.
          await db
            .insert(dailyActivity)
            .values(values)
            .onConflictDoUpdate({ target: dailyActivity.localDate, set: values });
          accepted++;
        }
        break;
      }
    }

    await db.insert(syncLog).values({
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
