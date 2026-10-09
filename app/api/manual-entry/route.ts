import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAccount, resolveWorkspaceAccountId } from "@/lib/auth";
import { dailyActivity, getDb, hydrationEntries, sleepSessions, weightEntries } from "@/lib/db";
import { instantOfLocal, todayLocal } from "@/lib/dates";
import { getSettings } from "@/lib/stats";

// Manual entry fallback (specs/phase-2-open-wearables.md §5): weight, sleep,
// water, and daily activity for one day, written with source "manual". Each
// row gets a deterministic provenance id (manual-<kind>-<date>) so
// resubmitting a day corrects it rather than duplicating it — the same
// upsert-on-provenance pattern the ingest route uses. Bounds mirror
// lib/ingest/schemas.ts. Nutrition is deliberately not here.

const KG_TO_LBS = 2.2046226218;

const bodySchema = z
  .strictObject({
    accountId: z.number().int().positive().optional(),
    date: z.iso.date().optional(),
    weightLbs: z.number().positive().max(1_000 * KG_TO_LBS).optional(),
    sleepHours: z.number().positive().max(24).optional(),
    waterMl: z.number().nonnegative().max(20_000).optional(),
    steps: z.number().int().nonnegative().max(200_000).optional(),
    activeCalories: z.number().nonnegative().max(20_000).optional(),
    totalCalories: z.number().nonnegative().max(20_000).optional(),
  })
  .refine(
    (b) =>
      b.weightLbs !== undefined ||
      b.sleepHours !== undefined ||
      b.waterMl !== undefined ||
      b.steps !== undefined ||
      b.activeCalories !== undefined ||
      b.totalCalories !== undefined,
    { message: "Provide at least one measurement." },
  );

export async function POST(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }
  const b = parsed.data;

  const accountId = await resolveWorkspaceAccountId(session, b.accountId ?? null);
  if (accountId instanceof NextResponse) return accountId;

  const tz = (await getSettings(accountId)).timezone;
  const today = todayLocal(tz);
  const date = b.date ?? today;
  if (date > today) {
    return NextResponse.json(
      { error: "Validation failed", issues: { date: "Can't log data for a future date." } },
      { status: 422 },
    );
  }

  const saved: string[] = [];
  const db = await getDb();
  await db.transaction(async (tx) => {
    if (b.weightLbs !== undefined) {
      const values = {
        accountId,
        providerUid: `manual-weight-${date}`,
        source: "manual",
        measuredAt: instantOfLocal(date, 12, 0, tz),
        localDate: date,
        weightLbs: b.weightLbs,
      };
      await tx
        .insert(weightEntries)
        .values(values)
        .onConflictDoUpdate({ target: [weightEntries.accountId, weightEntries.providerUid], set: values });
      saved.push("weight");
    }

    if (b.sleepHours !== undefined) {
      // A night is attributed to its wake-up date, as in the ingest route.
      const endedAt = instantOfLocal(date, 7, 0, tz);
      const durationMin = Math.round(b.sleepHours * 60);
      const values = {
        accountId,
        providerUid: `manual-sleep-${date}`,
        source: "manual",
        localDate: date,
        startedAt: new Date(endedAt.getTime() - durationMin * 60_000),
        endedAt,
        durationMin,
      };
      await tx
        .insert(sleepSessions)
        .values(values)
        .onConflictDoUpdate({ target: [sleepSessions.accountId, sleepSessions.providerUid], set: values });
      saved.push("sleep");
    }

    if (b.waterMl !== undefined) {
      const values = {
        accountId,
        providerUid: `manual-hydration-${date}`,
        source: "manual",
        localDate: date,
        volumeMl: b.waterMl,
      };
      await tx
        .insert(hydrationEntries)
        .values(values)
        .onConflictDoUpdate({
          target: [hydrationEntries.accountId, hydrationEntries.providerUid],
          set: values,
        });
      saved.push("hydration");
    }

    if (b.steps !== undefined || b.activeCalories !== undefined || b.totalCalories !== undefined) {
      // One row per account per day (unique on local_date), so this can land
      // on a synced row. Only the provided columns are overwritten.
      const provided = {
        ...(b.steps !== undefined && { steps: b.steps }),
        ...(b.activeCalories !== undefined && { activeCalories: b.activeCalories }),
        ...(b.totalCalories !== undefined && { totalCalories: b.totalCalories }),
      };
      const stamp = { providerUid: `manual-activity-${date}`, source: "manual" };
      await tx
        .insert(dailyActivity)
        .values({ accountId, localDate: date, ...stamp, ...provided })
        .onConflictDoUpdate({
          target: [dailyActivity.accountId, dailyActivity.localDate],
          set: { ...stamp, ...provided },
        });
      saved.push("activity");
    }
  });

  return NextResponse.json({ ok: true, accountId, date, saved });
}
