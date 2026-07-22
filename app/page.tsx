import Link from "next/link";
import { eq } from "drizzle-orm";
import { checkIns, getDb } from "@/lib/db";
import { mondayOf, todayLocal } from "@/lib/dates";
import { dashboardData, weekStats } from "@/lib/stats";
import { formatHeight, type WeightCapResult } from "@/lib/classic-physique";
import { DIVISION_WEIGHT_CAPS, divisionLabel } from "@/lib/divisions";
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
  const data = await dashboardData();
  const { settings, protocol } = data;
  const weekStart = mondayOf(todayLocal(settings.timezone));
  const stats = await weekStats(weekStart);

  const db = await getDb();
  const [weekCheckIn] = await db
    .select()
    .from(checkIns)
    .where(eq(checkIns.weekStart, weekStart));

  const caps: { division: string; result: WeightCapResult }[] =
    settings.heightInches != null
      ? settings.divisions
          .map((d) => {
            const fn = DIVISION_WEIGHT_CAPS[d as keyof typeof DIVISION_WEIGHT_CAPS];
            return fn ? { division: d, result: fn(settings.heightInches!) } : null;
          })
          .filter((c): c is { division: string; result: WeightCapResult } => c != null)
      : [];
  const latest = data.latestWeight;
  const toTarget =
    latest && settings.targetStageWeightLbs != null
      ? Math.round((latest.weightLbs - settings.targetStageWeightLbs) * 10) / 10
      : null;

  return (
    <div className="space-y-4">
      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs font-medium text-muted uppercase tracking-wide">
            {settings.showName ?? "Show day"}
          </p>
          {data.daysToShow != null ? (
            <>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {data.daysToShow > 0 ? data.daysToShow : 0}
                <span className="ml-1 text-base font-normal text-muted">days out</span>
              </p>
              <p className="mt-1 text-xs text-muted">{settings.showDate}</p>
              {settings.divisions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {settings.divisions.map((d) => (
                    <span
                      key={d}
                      className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent"
                    >
                      {divisionLabel(d)}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Set your show date in <Link href="/settings" className="text-accent underline">Settings</Link>.
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
                {toTarget != null && ` · ${Math.abs(toTarget)} lbs ${toTarget > 0 ? "above" : "under"} stage target`}
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

        <Card>
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Class weight cap</p>
          {settings.heightInches == null ? (
            <p className="mt-2 text-sm text-muted">
              Set your height in <Link href="/settings" className="text-accent underline">Settings</Link>{" "}
              or use the <Link href="/calculator" className="text-accent underline">calculator</Link>.
            </p>
          ) : caps.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              No weight-classed division selected — weight caps apply to
              divisions like Classic Physique.
            </p>
          ) : (
            <div className={caps.length > 1 ? "mt-1 space-y-2" : "mt-1"}>
              {caps.map(({ division, result }) => (
                <div key={division}>
                  <p className="text-3xl font-semibold tabular-nums">
                    {result.maxWeightLbs}
                    <span className="ml-1 text-base font-normal text-muted">lbs max</span>
                  </p>
                  <p className="text-xs text-muted">
                    {divisionLabel(division)} @ {formatHeight(settings.heightInches!)}
                    {latest && (
                      <span>
                        {" · "}
                        {latest.weightLbs <= result.maxWeightLbs ? (
                          <span className="text-good">under by {Math.round((result.maxWeightLbs - latest.weightLbs) * 10) / 10}</span>
                        ) : (
                          <span className="text-bad">over by {Math.round((latest.weightLbs - result.maxWeightLbs) * 10) / 10}</span>
                        )}
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Bodyweight — last 90 days">
          <WeightChart
            series={data.weightSeries}
            trend={data.weightTrend}
            targetLbs={settings.targetStageWeightLbs}
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
