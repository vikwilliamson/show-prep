import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { checkIns, getDb } from "@/lib/db";
import { dataAnswers, generateCheckinDraft } from "@/lib/ai/analysis";
import { getSettings, weekStats } from "@/lib/stats";
import type { CheckinQuestion } from "@/lib/checkin-template";

// Allow long-running Claude/Voyage calls on Vercel (clamped to the plan's max).
export const maxDuration = 300;

const schema = z.object({ weekStart: z.iso.date() });

// POST /api/checkins/draft — generate the filled-in coach template for a week
// (manual answers should be saved via PUT /api/checkins first).
export async function POST(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "weekStart required" }, { status: 422 });
  }
  const { weekStart } = parsed.data;

  const db = await getDb();
  const settings = await getSettings(session.accountId);
  const stats = await weekStats(session.accountId, weekStart);
  const [existing] = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.accountId, session.accountId), eq(checkIns.weekStart, weekStart)));

  try {
    const draft = await generateCheckinDraft({
      template: settings.checkinTemplate as CheckinQuestion[],
      stats,
      settings,
      manual: {
        waistIn: existing?.waistIn ?? null,
        strengthTrend: existing?.strengthTrend ?? null,
        digestion: existing?.digestion ?? null,
        changeRequests: existing?.changeRequests ?? null,
        manualNotes: existing?.manualNotes ?? null,
      },
    });

    const snapshot = dataAnswers(stats, settings);
    const values = {
      accountId: session.accountId,
      weekStart,
      generatedDraft: draft,
      dataAnswers: snapshot,
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(checkIns)
      .values(values)
      .onConflictDoUpdate({ target: [checkIns.accountId, checkIns.weekStart], set: values })
      .returning();
    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Draft generation failed" },
      { status: 502 },
    );
  }
}
