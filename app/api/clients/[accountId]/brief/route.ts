import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getClientAccount, requireCoach, SESSION_COOKIE } from "@/lib/auth";
import { coachBriefs, getDb } from "@/lib/db";
import { generateCoachBrief } from "@/lib/ai/brief";
import { mondayOf, todayLocal } from "@/lib/dates";
import { getSettings, weekStats } from "@/lib/stats";

// Allow long-running Claude calls on Vercel (clamped to the plan's max).
export const maxDuration = 300;

// GET /api/clients/[accountId]/brief?weekStart=YYYY-MM-DD — fetch the
// current (or given) week's brief for a client. Coach-only; 404s on a
// non-client accountId, same pattern as
// app/api/clients/[accountId]/dashboard/route.ts.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ accountId: string }> },
) {
  const authError = requireCoach(req.cookies.get(SESSION_COOKIE)?.value);
  if (authError) return authError;

  const { accountId } = await ctx.params;
  const client = await getClientAccount(Number(accountId));
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await getSettings(client.id);
  const weekStart =
    req.nextUrl.searchParams.get("weekStart") ?? mondayOf(todayLocal(settings.timezone));

  const db = await getDb();
  const [row] = await db
    .select()
    .from(coachBriefs)
    .where(and(eq(coachBriefs.accountId, client.id), eq(coachBriefs.weekStart, weekStart)));

  return NextResponse.json({ weekStart, brief: row ?? null });
}

const postSchema = z.object({ weekStart: z.iso.date().optional() });

// POST /api/clients/[accountId]/brief — generate (or regenerate) a draft
// brief for a client's week. Regenerating an already-approved brief resets
// it back to 'draft' and clears approvedAt — a fresh AI draft was never
// actually re-approved (specs/phase-3-ai-weekly-coach-brief.md §1).
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ accountId: string }> },
) {
  const authError = requireCoach(req.cookies.get(SESSION_COOKIE)?.value);
  if (authError) return authError;

  const { accountId } = await ctx.params;
  const client = await getClientAccount(Number(accountId));
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  const settings = await getSettings(client.id);
  const weekStart = parsed.data.weekStart ?? mondayOf(todayLocal(settings.timezone));
  const stats = await weekStats(client.id, weekStart);
  const content = await generateCoachBrief(stats, settings, client.name);

  const db = await getDb();
  const values = {
    accountId: client.id,
    weekStart,
    status: "draft",
    content,
    generatedAt: new Date(),
    approvedAt: null,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(coachBriefs)
    .values(values)
    .onConflictDoUpdate({ target: [coachBriefs.accountId, coachBriefs.weekStart], set: values })
    .returning();

  return NextResponse.json(row);
}

const putSchema = z.object({
  weekStart: z.iso.date(),
  content: z.string().min(1),
  approve: z.boolean().optional(),
});

// PUT /api/clients/[accountId]/brief — edit and/or approve an existing
// draft. Editing an already-approved brief without approve:true updates
// content only, leaving approvedAt untouched.
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ accountId: string }> },
) {
  const authError = requireCoach(req.cookies.get(SESSION_COOKIE)?.value);
  if (authError) return authError;

  const { accountId } = await ctx.params;
  const client = await getClientAccount(Number(accountId));
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }
  const { weekStart, content, approve } = parsed.data;

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(coachBriefs)
    .where(and(eq(coachBriefs.accountId, client.id), eq(coachBriefs.weekStart, weekStart)));
  if (!existing) {
    return NextResponse.json({ error: "No brief to edit — generate one first" }, { status: 404 });
  }

  const [row] = await db
    .update(coachBriefs)
    .set({
      content,
      updatedAt: new Date(),
      ...(approve ? { status: "approved", approvedAt: new Date() } : {}),
    })
    .where(eq(coachBriefs.id, existing.id))
    .returning();

  return NextResponse.json(row);
}
