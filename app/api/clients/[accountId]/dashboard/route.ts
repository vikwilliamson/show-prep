import { NextResponse, type NextRequest } from "next/server";
import { getClientAccount, requireCoach, SESSION_COOKIE } from "@/lib/auth";
import { mondayOf, todayLocal } from "@/lib/dates";
import { dashboardData, weekStats } from "@/lib/stats";

// GET — coach-only. Calls the same dashboardData()/weekStats() the client's
// own dashboard uses, but with the *path param's* accountId rather than the
// caller's own session accountId — reusing Phase 1's account-scoped data
// layer rather than a new one. 404s (not empty data) if accountId isn't a
// real client account, so a coach can't probe another coach's data by ID.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ accountId: string }> },
) {
  const authError = requireCoach(req.cookies.get(SESSION_COOKIE)?.value);
  if (authError) return authError;

  const { accountId } = await ctx.params;
  const client = await getClientAccount(Number(accountId));
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dashboard = await dashboardData(client.id);
  const weekStart = mondayOf(todayLocal(dashboard.settings.timezone));
  const stats = await weekStats(client.id, weekStart);

  return NextResponse.json({ account: client, dashboard, stats });
}
