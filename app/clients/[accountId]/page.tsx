import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getClientAccount, getCurrentAccount, SESSION_COOKIE } from "@/lib/auth";
import { mondayOf, todayLocal } from "@/lib/dates";
import { dashboardData, effectiveMacroTargets, weekStats } from "@/lib/stats";
import { programTypeLabel } from "@/lib/program-types";
import { WeightChart } from "@/components/WeightChart";
import { ComplianceChart } from "@/components/ComplianceChart";

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

export default async function ClientDashboard({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const jar = await cookies();
  const session = getCurrentAccount(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  if (session.role !== "coach") redirect("/");

  const { accountId } = await params;
  const client = await getClientAccount(Number(accountId));
  if (!client) notFound();

  const data = await dashboardData(client.id);
  const { settings, protocol } = data;
  const macroTargets = effectiveMacroTargets(settings, protocol);
  const weekStart = mondayOf(todayLocal(settings.timezone));
  const stats = await weekStats(client.id, weekStart);

  const latest = data.latestWeight;
  const toTarget =
    latest && settings.targetWeightLbs != null
      ? Math.round((latest.weightLbs - settings.targetWeightLbs) * 10) / 10
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{client.name}</h1>
        <Link href="/clients" className="text-sm text-accent underline">
          ← All clients
        </Link>
      </div>

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
            <p className="mt-2 text-sm text-muted">No target date set.</p>
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
          <p className="text-xs font-medium text-muted uppercase tracking-wide">
            {protocol ? "Active protocol" : "Nutrition target"}
          </p>
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
          ) : macroTargets.calories != null ? (
            <>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {macroTargets.calories}
                <span className="ml-1 text-base font-normal text-muted">kcal</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {macroTargets.proteinG ?? "?"}P / {macroTargets.carbsG ?? "?"}C /{" "}
                {macroTargets.fatG ?? "?"}F · manual target, no active coach protocol
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No active protocol or manual target set.</p>
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
            targets={macroTargets.calories != null ? macroTargets : null}
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

      <Card title="This week at a glance">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
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
        </ul>
        {protocol?.cardioPlan && (
          <p className="mt-3 border-t border-borderc pt-2 text-xs text-muted">
            Cardio plan: {protocol.cardioPlan}
          </p>
        )}
      </Card>
    </div>
  );
}
