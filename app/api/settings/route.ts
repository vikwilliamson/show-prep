import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getAccountReferenceId, requireAccount } from "@/lib/auth";
import { getDb, settings, weeklyTargets } from "@/lib/db";
import { getSettings, getTargets } from "@/lib/stats";
import { settingsPutSchema } from "@/lib/settings-schema";

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

  const parsed = settingsPutSchema.safeParse(await req.json());
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
