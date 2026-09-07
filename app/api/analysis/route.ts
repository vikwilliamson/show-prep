import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { checkIns, getDb } from "@/lib/db";
import { generateWeeklyAnalysis } from "@/lib/ai/analysis";
import { mondayOf, todayLocal } from "@/lib/dates";
import { getSettings, weekStats } from "@/lib/stats";

// Allow long-running Claude/Voyage calls on Vercel (clamped to the plan's max).
export const maxDuration = 300;

const schema = z.object({ weekStart: z.iso.date().optional() });

// POST /api/analysis — AI-written plain-language analysis of a week,
// persisted on that week's check_ins row.
export async function POST(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid weekStart" }, { status: 422 });
  }

  const accountId = session.accountId;
  const settings = await getSettings(accountId);
  const weekStart =
    parsed.data.weekStart ?? mondayOf(todayLocal(settings.timezone));
  const stats = await weekStats(accountId, weekStart);

  try {
    const analysis = await generateWeeklyAnalysis(stats, settings);
    const db = await getDb();
    const values = { accountId, weekStart, aiAnalysis: analysis, updatedAt: new Date() };
    await db
      .insert(checkIns)
      .values(values)
      .onConflictDoUpdate({ target: [checkIns.accountId, checkIns.weekStart], set: values });
    return NextResponse.json({ weekStart, analysis });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 502 },
    );
  }
}
