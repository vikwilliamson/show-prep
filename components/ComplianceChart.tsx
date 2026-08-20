"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

export interface ComplianceDay {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

function MacroTooltip({
  active,
  payload,
  label,
  targets,
}: TooltipContentProps<ValueType, NameType> & {
  targets: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null } | null;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ComplianceDay;
  const row = (name: string, v: number, t: number | null | undefined, unit: string) => (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{name}</span>
      <span>
        {Math.round(v)}
        {unit}
        {t != null && <span className="text-muted"> / {t}{unit}</span>}
      </span>
    </div>
  );
  return (
    <div className="rounded-lg border border-borderc bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium">{label}</div>
      {row("Calories", d.calories, targets?.calories, "")}
      {row("Protein", d.proteinG, targets?.proteinG, "g")}
      {row("Carbs", d.carbsG, targets?.carbsG, "g")}
      {row("Fat", d.fatG, targets?.fatG, "g")}
    </div>
  );
}

export function ComplianceChart({
  days,
  targets,
}: {
  days: ComplianceDay[];
  targets: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  } | null;
}) {
  if (days.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No meals logged in the last 14 days.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={days} margin={{ top: 8, right: 12, bottom: 0, left: -16 }} barCategoryGap="18%">
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
        />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          cursor={{ fill: "var(--grid)", opacity: 0.5 }}
          content={(props) => <MacroTooltip {...props} targets={targets} />}
        />
        {targets?.calories != null && (
          <ReferenceLine
            y={targets.calories}
            stroke="var(--muted)"
            strokeDasharray="6 4"
            label={{
              value: `target ${targets.calories} kcal`,
              position: "insideTopRight",
              fill: "var(--muted)",
              fontSize: 11,
            }}
          />
        )}
        <Bar
          name="Calories eaten"
          dataKey="calories"
          fill="var(--series-1)"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
