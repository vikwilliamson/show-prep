import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { checkIns, getDb } from "@/lib/db";
import { dataAnswers } from "@/lib/ai/analysis";
import { mondayOf, todayLocal } from "@/lib/dates";
import { getSettings, weekStats } from "@/lib/stats";
import type { CheckinQuestion } from "@/lib/checkin-template";

// GET /api/checkins?weekStart=YYYY-MM-DD
// Returns everything the check-in page needs for one week: the saved row (if
// any), computed week stats, deterministic data answers, and the template.
export async function GET(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const settings = await getSettings(session.accountId);
  const weekStart =
    req.nextUrl.searchParams.get("weekStart") ??
    mondayOf(todayLocal(settings.timezone));

  const db = await getDb();
  const [row] = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.accountId, session.accountId), eq(checkIns.weekStart, weekStart)));
  const stats = await weekStats(session.accountId, weekStart);

  return NextResponse.json({
    weekStart,
    checkIn: row ?? null,
    stats,
    dataAnswers: dataAnswers(stats, settings),
    template: settings.checkinTemplate as CheckinQuestion[],
  });
}

const putSchema = z.object({
  weekStart: z.iso.date(),
  waistIn: z.number().positive().nullable().optional(),
  strengthTrend: z.string().nullable().optional(),
  digestion: z.string().nullable().optional(),
  changeRequests: z.string().nullable().optional(),
  manualNotes: z.string().nullable().optional(),
  sent: z.boolean().optional(),
});

// PUT /api/checkins — upsert the manual (subjective) answers for a week.
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
  const { weekStart, sent, ...fields } = parsed.data;
  const db = await getDb();

  const values = {
    accountId: session.accountId,
    weekStart,
    ...fields,
    ...(sent !== undefined ? { sentAt: sent ? new Date() : null } : {}),
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(checkIns)
    .values(values)
    .onConflictDoUpdate({ target: [checkIns.accountId, checkIns.weekStart], set: values })
    .returning();
  return NextResponse.json(row);
}
