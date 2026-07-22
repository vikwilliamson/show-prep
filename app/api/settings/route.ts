import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, settings, weeklyTargets } from "@/lib/db";
import { getSettings, getTargets } from "@/lib/stats";

export async function GET() {
  const [s, t] = await Promise.all([getSettings(), getTargets()]);
  return NextResponse.json({ settings: s, targets: t });
}

const putSchema = z.object({
  settings: z
    .object({
      showName: z.string().nullable().optional(),
      showDate: z.iso.date().nullable().optional(),
      divisions: z.array(z.string()).min(1).optional(),
      nextCompetitionNote: z.string().nullable().optional(),
      targetStageWeightLbs: z.number().positive().nullable().optional(),
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
  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }
  const db = await getDb();

  if (parsed.data.settings && Object.keys(parsed.data.settings).length) {
    await db.update(settings).set(parsed.data.settings).where(eq(settings.id, 1));
  }
  if (parsed.data.targets && Object.keys(parsed.data.targets).length) {
    const current = await getTargets();
    await db
      .update(weeklyTargets)
      .set(parsed.data.targets)
      .where(eq(weeklyTargets.id, current.id));
  }

  const [s, t] = await Promise.all([getSettings(), getTargets()]);
  return NextResponse.json({ settings: s, targets: t });
}
