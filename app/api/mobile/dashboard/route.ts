import { NextResponse, type NextRequest } from "next/server";
import { getAccountByReferenceId } from "@/lib/auth";
import { checkIngestAuth } from "@/lib/ingest/auth";
import { mondayOf, todayLocal } from "@/lib/dates";
import { dashboardData, effectiveMacroTargets, weekStats } from "@/lib/stats";

// GET /api/mobile/dashboard?referenceId=<uuid> — the companion app's
// counterpart to /api/clients/[accountId]/dashboard. Same dashboardData()/
// weekStats() data layer, but identified the way /api/ingest/* already is
// (shared bearer token proves "this is a legitimate companion client",
// referenceId says whose data it is) since the mobile app has no session
// cookie to read a coach-style auth check off of.
export async function GET(req: NextRequest) {
  const denied = checkIngestAuth(req);
  if (denied) return denied;

  const referenceId = req.nextUrl.searchParams.get("referenceId");
  if (!referenceId) {
    return NextResponse.json({ error: "Missing referenceId" }, { status: 400 });
  }

  const accountId = await getAccountByReferenceId(referenceId);
  if (accountId === null) {
    return NextResponse.json({ error: "Unknown referenceId" }, { status: 401 });
  }

  const dashboard = await dashboardData(accountId);
  const weekStart = mondayOf(todayLocal(dashboard.settings.timezone));
  const stats = await weekStats(accountId, weekStart);

  // Mirrors app/page.tsx's web dashboard: an active protocol's macros win
  // when one exists, otherwise fall back to the account's manual Settings
  // target (VIK-138) — a client with no active protocol still sees the
  // coach-set target they can no longer edit themselves (VIK-136).
  const macroTargets = effectiveMacroTargets(dashboard.settings, dashboard.protocol);
  const fromProtocol = dashboard.protocol?.calories != null;
  const nutritionTarget =
    macroTargets.calories != null
      ? {
          calories: macroTargets.calories,
          proteinG: macroTargets.proteinG,
          carbsG: macroTargets.carbsG,
          fatG: macroTargets.fatG,
          source: fromProtocol ? ("protocol" as const) : ("manual" as const),
          effectiveFrom: fromProtocol ? dashboard.protocol!.effectiveFrom : null,
        }
      : null;

  // dashboardData()/weekStats() compute far more than the mobile screen
  // shows (90-day weightSeries/weightTrend, 13-day compliance, per-day
  // water/sleep/training arrays, raw settings/protocol rows) — trim to what
  // mobile/src/dashboard.ts actually consumes rather than shipping it all.
  return NextResponse.json({
    dashboard: {
      settings: {
        targetName: dashboard.settings.targetName,
        targetDate: dashboard.settings.targetDate,
        targetWeightLbs: dashboard.settings.targetWeightLbs,
      },
      nutritionTarget,
      daysToTarget: dashboard.daysToTarget,
      latestWeight: dashboard.latestWeight
        ? { weightLbs: dashboard.latestWeight.weightLbs }
        : null,
      weeklyChangeLbs: dashboard.weeklyChangeLbs,
    },
    stats: {
      water: {
        daysLogged: stats.water.daysLogged,
        daysMet: stats.water.daysMet,
        avgLiters: stats.water.avgLiters,
        targetLiters: stats.water.targetLiters,
      },
      sleep: {
        nightsLogged: stats.sleep.nightsLogged,
        nightsMet: stats.sleep.nightsMet,
        avgHours: stats.sleep.avgHours,
        targetHours: stats.sleep.targetHours,
      },
      training: {
        strengthCount: stats.training.strengthCount,
        strengthTarget: stats.training.strengthTarget,
        cardioCount: stats.training.cardioCount,
        cardioTarget: stats.training.cardioTarget,
      },
    },
  });
}
