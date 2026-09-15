import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getAccountReferenceId, requireAccount } from "@/lib/auth";
import { CheckinQuestionSchema } from "@/lib/checkin-template";
import { getDb, settings, weeklyTargets } from "@/lib/db";
import { getSettings, getTargets } from "@/lib/stats";
import { PROGRAM_TYPES } from "@/lib/program-types";

export async function GET(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const [s, t, referenceId] = await Promise.all([
    getSettings(session.accountId),
    getTargets(session.accountId),
    getAccountReferenceId(session.accountId),
  ]);
  return NextResponse.json({
    settings: s,
    targets: t,
    referenceId,
    role: session.role,
  });
}

const putSchema = z.object({
  settings: z
    .object({
      targetName: z.string().nullable().optional(),
      targetDate: z.iso.date().nullable().optional(),
      programType: z.enum(PROGRAM_TYPES).nullable().optional(),
      targetNote: z.string().nullable().optional(),
      targetWeightLbs: z.number().positive().nullable().optional(),
      heightInches: z.number().positive().nullable().optional(),
      targetCalories: z.number().int().positive().nullable().optional(),
      targetProteinG: z.number().int().nonnegative().nullable().optional(),
      targetCarbsG: z.number().int().nonnegative().nullable().optional(),
      targetFatG: z.number().int().nonnegative().nullable().optional(),
      timezone: z.string().optional(),
      checkinTemplate: z.array(CheckinQuestionSchema).min(1).optional(),
    })
    .optional(),
  targets: z
    .object({
      waterMlMin: z.number().int().positive().optional(),
      sleepHoursMin: z.number().positive().optional(),
      workoutsPerWeekMin: z.number().int().nonnegative().optional(),
      cardioSessionsPerWeek: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

// Nutrition target and weekly targets are coaching decisions, not something
// a client sets for themselves (VIK-136) — a client session's write to
// these fields is silently ignored rather than rejected, since the fields
// aren't exposed in the client-role UI in the first place.
const CLIENT_RESTRICTED_SETTINGS_FIELDS = [
  "targetCalories",
  "targetProteinG",
  "targetCarbsG",
  "targetFatG",
] as const;

export async function PUT(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }
  const db = await getDb();
  const isClient = session.role === "client";

  const settingsUpdate = { ...parsed.data.settings };
  if (isClient) {
    for (const field of CLIENT_RESTRICTED_SETTINGS_FIELDS) {
      delete settingsUpdate[field];
    }
  }
  const targetsUpdate = isClient ? {} : { ...parsed.data.targets };

  if (Object.keys(settingsUpdate).length) {
    const current = await getSettings(session.accountId);
    await db
      .update(settings)
      .set(settingsUpdate)
      .where(
        and(
          eq(settings.id, current.id),
          eq(settings.accountId, session.accountId),
        ),
      );
  }
  if (Object.keys(targetsUpdate).length) {
    const current = await getTargets(session.accountId);
    await db
      .update(weeklyTargets)
      .set(targetsUpdate)
      .where(
        and(
          eq(weeklyTargets.id, current.id),
          eq(weeklyTargets.accountId, session.accountId),
        ),
      );
  }

  const [s, t] = await Promise.all([
    getSettings(session.accountId),
    getTargets(session.accountId),
  ]);
  return NextResponse.json({ settings: s, targets: t });
}
