import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { getDb, settings, weeklyTargets } from "@/lib/db";
import { getSettings, getTargets } from "@/lib/stats";
import { PROGRAM_TYPES } from "@/lib/program-types";

export async function GET(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const [s, t] = await Promise.all([
    getSettings(session.accountId),
    getTargets(session.accountId),
  ]);
  return NextResponse.json({ settings: s, targets: t });
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
      timezone: z.string().optional(),
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

  if (parsed.data.settings && Object.keys(parsed.data.settings).length) {
    const current = await getSettings(session.accountId);
    await db.update(settings).set(parsed.data.settings).where(eq(settings.id, current.id));
  }
  if (parsed.data.targets && Object.keys(parsed.data.targets).length) {
    const current = await getTargets(session.accountId);
    await db
      .update(weeklyTargets)
      .set(parsed.data.targets)
      .where(eq(weeklyTargets.id, current.id));
  }

  const [s, t] = await Promise.all([
    getSettings(session.accountId),
    getTargets(session.accountId),
  ]);
  return NextResponse.json({ settings: s, targets: t });
}
