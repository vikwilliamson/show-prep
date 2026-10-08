import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getClientAccount, requireCoach, SESSION_COOKIE } from "@/lib/auth";
import { getDb, settings, weeklyTargets } from "@/lib/db";
import { settingsPutSchema } from "@/lib/settings-schema";
import { getSettings, getTargets } from "@/lib/stats";

// Coach-only, scoped to the path param's client via getClientAccount() (404
// for anything that isn't a real client account). This is where a coach sets
// a client's target date/weight and nutrition/weekly targets — the coach's own
// /api/settings row isn't a coaching surface (see specs/phase-2.5-coach-dashboard.md).
async function resolveClient(req: NextRequest, ctx: { params: Promise<{ accountId: string }> }) {
  const authError = requireCoach(req.cookies.get(SESSION_COOKIE)?.value);
  if (authError) return authError;
  const { accountId } = await ctx.params;
  const client = await getClientAccount(Number(accountId));
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return client;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ accountId: string }> }) {
  const client = await resolveClient(req, ctx);
  if (client instanceof NextResponse) return client;

  const [s, t] = await Promise.all([getSettings(client.id), getTargets(client.id)]);
  return NextResponse.json({ settings: s, targets: t });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ accountId: string }> }) {
  const client = await resolveClient(req, ctx);
  if (client instanceof NextResponse) return client;

  const parsed = settingsPutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  const db = await getDb();
  const settingsUpdate = parsed.data.settings ?? {};
  const targetsUpdate = parsed.data.targets ?? {};

  if (Object.keys(settingsUpdate).length) {
    const current = await getSettings(client.id);
    await db
      .update(settings)
      .set(settingsUpdate)
      .where(and(eq(settings.id, current.id), eq(settings.accountId, client.id)));
  }
  if (Object.keys(targetsUpdate).length) {
    const current = await getTargets(client.id);
    await db
      .update(weeklyTargets)
      .set(targetsUpdate)
      .where(and(eq(weeklyTargets.id, current.id), eq(weeklyTargets.accountId, client.id)));
  }

  const [s, t] = await Promise.all([getSettings(client.id), getTargets(client.id)]);
  return NextResponse.json({ settings: s, targets: t });
}
