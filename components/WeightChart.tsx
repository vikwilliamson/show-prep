"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Point {
  date: string;
  weightLbs: number | null;
  trendLbs: number | null;
}

function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

export function WeightChart({
  series,
  trend,
  targetLbs,
}: {
  series: { date: string; weightLbs: number }[];
  trend: { date: string; weightLbs: number }[];
  targetLbs: number | null;
}) {
  const trendByDate = new Map(trend.map((t) => [t.date, t.weightLbs]));
  const data: Point[] = series.map((p) => ({
    date: p.date,
    weightLbs: p.weightLbs,
    trendLbs: trendByDate.get(p.date) ?? null,
  }));

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No weigh-ins yet — sync the companion app to see your trend.
      </p>
    );
  }

  const values = data.map((d) => d.weightLbs!).filter((v) => v != null);
  const lo = Math.floor(Math.min(...values, targetLbs ?? Infinity) - 2);
  const hi = Math.ceil(Math.max(...values) + 2);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          minTickGap={24}
        />
        <YAxis
          domain={[lo, hi]}
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          labelFormatter={(d) => String(d)}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--foreground)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
        {targetLbs != null && (
          <ReferenceLine
            y={targetLbs}
            stroke="var(--muted)"
            strokeDasharray="6 4"
            label={{
              value: `target ${targetLbs} lbs`,
              position: "insideBottomRight",
              fill: "var(--muted)",
              fontSize: 11,
            }}
          />
        )}
        <Line
          name="Daily weigh-in"
          dataKey="weightLbs"
          stroke="var(--series-1)"
          strokeWidth={1}
          strokeOpacity={0.55}
          dot={{ r: 2, fill: "var(--series-1)", strokeWidth: 0 }}
          isAnimationActive={false}
        />
        <Line
          name="7-day trend"
          dataKey="trendLbs"
          stroke="var(--series-2)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
