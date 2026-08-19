import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getCurrentAccount, SESSION_COOKIE } from "@/lib/auth";
import { checkIns, getDb } from "@/lib/db";
import { mondayOf, todayLocal } from "@/lib/dates";
import { dashboardData, weekStats } from "@/lib/stats";
import { programTypeLabel } from "@/lib/program-types";
import { WeightChart } from "@/components/WeightChart";
import { ComplianceChart } from "@/components/ComplianceChart";
import { WeeklyAnalysis } from "@/components/WeeklyAnalysis";

export const dynamic = "force-dynamic";

function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-borderc bg-surface p-4 ${className}`}
    >
      {title && (
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export default async function Dashboard() {
  const jar = await cookies();
  const session = getCurrentAccount(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");

  const data = await dashboardData(session.accountId);
  const { settings, protocol } = data;
  const weekStart = mondayOf(todayLocal(settings.timezone));
  const stats = await weekStats(session.accountId, weekStart);

  const db = await getDb();
  const [weekCheckIn] = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.accountId, session.accountId), eq(checkIns.weekStart, weekStart)));

  const latest = data.latestWeight;
  const toTarget =
    latest && settings.targetWeightLbs != null
      ? Math.round((latest.weightLbs - settings.targetWeightLbs) * 10) / 10
      : null;

  return (
    <div className="space-y-4">
      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <p className="text-xs font-medium text-muted uppercase tracking-wide">
            {settings.targetName ?? "Target date"}
          </p>
          {data.daysToTarget != null ? (
            <>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {data.daysToTarget > 0 ? data.daysToTarget : 0}
                <span className="ml-1 text-base font-normal text-muted">days out</span>
              </p>
              <p className="mt-1 text-xs text-muted">{settings.targetDate}</p>
              {settings.programType && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    {programTypeLabel(settings.programType)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Set your target date in <Link href="/settings" className="text-accent underline">Settings</Link>.
            </p>
          )}
        </Card>

        <Card>
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Current weight</p>
          {latest ? (
            <>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {latest.weightLbs}
                <span className="ml-1 text-base font-normal text-muted">lbs</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {data.weeklyChangeLbs != null && (
                  <span className={data.weeklyChangeLbs <= 0 ? "text-good" : "text-warn"}>
                    {data.weeklyChangeLbs > 0 ? "+" : ""}
                    {data.weeklyChangeLbs} lbs/wk
                  </span>
                )}
                {toTarget != null && ` · ${Math.abs(toTarget)} lbs ${toTarget > 0 ? "above" : "under"} target`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No weigh-ins synced yet.</p>
          )}
        </Card>

        <Card>
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Active protocol</p>
          {protocol ? (
            <>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {protocol.calories ?? "—"}
                <span className="ml-1 text-base font-normal text-muted">kcal</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {protocol.proteinG ?? "?"}P / {protocol.carbsG ?? "?"}C / {protocol.fatG ?? "?"}F
                {" · since "}
                {protocol.effectiveFrom}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              No active protocol — upload a coach doc in{" "}
              <Link href="/documents" className="text-accent underline">Documents</Link>.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Bodyweight — last 90 days">
          <WeightChart
            series={data.weightSeries}
            trend={data.weightTrend}
            targetLbs={settings.targetWeightLbs}
          />
        </Card>

        <Card title="Macro compliance — last 14 days">
          <ComplianceChart
            days={data.compliance}
            targets={
              protocol
                ? {
                    calories: protocol.calories,
                    proteinG: protocol.proteinG,
                    carbsG: protocol.carbsG,
                    fatG: protocol.fatG,
                  }
                : null
            }
          />
          {stats.nutrition.avg && (
            <p className="mt-2 text-xs text-muted">
              This week: {stats.nutrition.daysLogged}/7 days logged, avg{" "}
              {stats.nutrition.avg.calories} kcal ({stats.nutrition.avg.proteinG}P/
              {stats.nutrition.avg.carbsG}C/{stats.nutrition.avg.fatG}F)
              {stats.nutrition.avgCaloriesDeltaPct != null &&
                ` — ${stats.nutrition.avgCaloriesDeltaPct > 0 ? "+" : ""}${stats.nutrition.avgCaloriesDeltaPct}% vs plan`}
              {stats.nutrition.onTargetDays != null &&
                `, ${stats.nutrition.onTargetDays} on-target days`}
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Weekly analysis — week of ${weekStart}`}>
          <WeeklyAnalysis
            weekStart={weekStart}
            initialAnalysis={weekCheckIn?.aiAnalysis ?? null}
          />
        </Card>

        <Card title="This week at a glance">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-muted">Water ({stats.water.targetLiters}L/day min)</span>
              <span className="tabular-nums">
                {stats.water.daysLogged
                  ? `${stats.water.daysMet}/${stats.water.daysLogged} days · avg ${stats.water.avgLiters}L`
                  : "no data"}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Sleep ({stats.sleep.targetHours}h min)</span>
              <span className="tabular-nums">
                {stats.sleep.nightsLogged
                  ? `${stats.sleep.nightsMet}/${stats.sleep.nightsLogged} nights · avg ${stats.sleep.avgHours}h`
                  : "no data"}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Lifting (min {stats.training.strengthTarget}/wk)</span>
              <span className="tabular-nums">{stats.training.strengthCount} sessions</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">
                Cardio{stats.training.cardioTarget > 0 ? ` (${stats.training.cardioTarget}/wk prescribed)` : ""}
              </span>
              <span className="tabular-nums">{stats.training.cardioCount} sessions</span>
            </li>
            {protocol?.cardioPlan && (
              <li className="border-t border-borderc pt-2 text-xs text-muted">
                Cardio plan: {protocol.cardioPlan}
              </li>
            )}
          </ul>
          <div className="mt-4">
            <Link
              href="/check-in"
              className="inline-block rounded-md border border-borderc px-3 py-1.5 text-sm font-medium hover:bg-borderc/30"
            >
              Draft this week&apos;s coach check-in →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
