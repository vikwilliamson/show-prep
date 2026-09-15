import type { CompanionConfig } from "./config";

// Fetches the read-only dashboard summary the companion app's second screen
// shows, via /api/mobile/dashboard — the same dashboardData()/weekStats()
// the web dashboard already computes (see specs/mobile-dashboard-view.md),
// never reimplemented on-device.

export const FETCH_TIMEOUT_MS = 15_000;

export interface DashboardSummary {
  targetName: string | null;
  targetDate: string | null;
  daysToTarget: number | null;
  currentWeightLbs: number | null;
  weeklyChangeLbs: number | null;
  targetWeightLbs: number | null;
  protocol: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    effectiveFrom: string | null;
  } | null;
  water: { daysLogged: number; daysMet: number; avgLiters: number | null; targetLiters: number };
  sleep: { nightsLogged: number; nightsMet: number; avgHours: number | null; targetHours: number };
  training: {
    strengthCount: number;
    strengthTarget: number;
    cardioCount: number;
    cardioTarget: number;
  };
}

interface DashboardApiResponse {
  dashboard: {
    settings: { targetName: string | null; targetDate: string | null; targetWeightLbs: number | null };
    protocol: DashboardSummary["protocol"];
    daysToTarget: number | null;
    latestWeight: { weightLbs: number } | null;
    weeklyChangeLbs: number | null;
  };
  stats: {
    water: DashboardSummary["water"];
    sleep: DashboardSummary["sleep"];
    training: DashboardSummary["training"];
  };
}

export async function fetchDashboard(config: CompanionConfig): Promise<DashboardSummary> {
  if (!config.serverUrl) throw new Error("Server URL not configured.");
  if (!config.referenceId) throw new Error("Pairing ID not configured.");

  const url = `${config.serverUrl.replace(/\/$/, "")}/api/mobile/dashboard?referenceId=${config.referenceId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Dashboard fetch timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Dashboard fetch failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const { dashboard, stats } = (await res.json()) as DashboardApiResponse;
  return {
    targetName: dashboard.settings.targetName,
    targetDate: dashboard.settings.targetDate,
    daysToTarget: dashboard.daysToTarget,
    currentWeightLbs: dashboard.latestWeight?.weightLbs ?? null,
    weeklyChangeLbs: dashboard.weeklyChangeLbs,
    targetWeightLbs: dashboard.settings.targetWeightLbs,
    protocol: dashboard.protocol,
    water: stats.water,
    sleep: stats.sleep,
    training: stats.training,
  };
}
