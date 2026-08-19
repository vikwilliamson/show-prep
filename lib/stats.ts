import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  getDb,
  hydrationEntries,
  nutritionEntries,
  protocols,
  settings,
  sleepSessions,
  weeklyTargets,
  weightEntries,
  workouts,
  type Protocol,
  type Settings,
  type WeeklyTargets,
  type Workout,
} from "./db";
import { DEFAULT_CHECKIN_TEMPLATE } from "./checkin-template";
import { addDays, daysBetween, todayLocal, weekDates } from "./dates";

/** Returns the account's settings row, creating a default one on first access. */
export async function getSettings(accountId: number): Promise<Settings> {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.accountId, accountId));
  if (row) return row;
  const [created] = await db
    .insert(settings)
    .values({ accountId, checkinTemplate: DEFAULT_CHECKIN_TEMPLATE })
    .returning();
  return created;
}

/** Returns the account's weekly targets row, creating a default one on first access. */
export async function getTargets(accountId: number): Promise<WeeklyTargets> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(weeklyTargets)
    .where(eq(weeklyTargets.accountId, accountId));
  if (row) return row;
  const [created] = await db.insert(weeklyTargets).values({ accountId }).returning();
  return created;
}

/** The protocol currently in effect (confirmed, most recent effective date). */
export async function getActiveProtocol(accountId: number): Promise<Protocol | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(protocols)
    .where(and(eq(protocols.accountId, accountId), eq(protocols.status, "active")))
    .orderBy(desc(protocols.effectiveFrom), desc(protocols.id))
    .limit(1);
  return row ?? null;
}

export interface DayMacros {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  meals: number;
}

/** Per-day macro totals from meal-summary rows, inclusive date range. */
export async function dailyMacros(
  accountId: number,
  from: string,
  to: string,
): Promise<DayMacros[]> {
  const db = await getDb();
  const rows = await db
    .select({
      date: nutritionEntries.localDate,
      calories: sql<number>`sum(${nutritionEntries.calories})`.mapWith(Number),
      proteinG: sql<number>`sum(${nutritionEntries.proteinG})`.mapWith(Number),
      carbsG: sql<number>`sum(${nutritionEntries.carbsG})`.mapWith(Number),
      fatG: sql<number>`sum(${nutritionEntries.fatG})`.mapWith(Number),
      meals: sql<number>`count(*)`.mapWith(Number),
    })
    .from(nutritionEntries)
    .where(
      and(
        eq(nutritionEntries.accountId, accountId),
        gte(nutritionEntries.localDate, from),
        lte(nutritionEntries.localDate, to),
      ),
    )
    .groupBy(nutritionEntries.localDate)
    .orderBy(asc(nutritionEntries.localDate));
  return rows;
}

export interface WeightPoint {
  date: string;
  weightLbs: number;
}

/** One weight per day (average of that day's readings), ascending. */
export async function dailyWeights(
  accountId: number,
  from: string,
  to: string,
): Promise<WeightPoint[]> {
  const db = await getDb();
  // float4 storage + avg() produce noise digits; round to 0.1 lb.
  return db
    .select({
      date: weightEntries.localDate,
      weightLbs: sql<number>`round(avg(${weightEntries.weightLbs})::numeric, 1)`.mapWith(Number),
    })
    .from(weightEntries)
    .where(
      and(
        eq(weightEntries.accountId, accountId),
        gte(weightEntries.localDate, from),
        lte(weightEntries.localDate, to),
      ),
    )
    .groupBy(weightEntries.localDate)
    .orderBy(asc(weightEntries.localDate));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 7-day rolling average over a daily weight series. */
export function rollingAvg(points: WeightPoint[], window = 7): WeightPoint[] {
  return points.map((p, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    const avg = slice.reduce((s, q) => s + q.weightLbs, 0) / slice.length;
    return { date: p.date, weightLbs: round1(avg) };
  });
}

export interface WeekStats {
  weekStart: string;
  weekEnd: string;
  protocol: Protocol | null;
  targets: WeeklyTargets;
  nutrition: {
    days: DayMacros[];
    daysLogged: number;
    avg: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
    /** Days within ±5% of calorie target AND within -10g of protein target. */
    onTargetDays: number | null;
    avgCaloriesDeltaPct: number | null;
  };
  weight: {
    latest: WeightPoint | null;
    avgThisWeek: number | null;
    avgPrevWeek: number | null;
    weeklyChangeLbs: number | null;
  };
  water: {
    days: { date: string; volumeMl: number }[];
    daysMet: number;
    daysLogged: number;
    avgLiters: number | null;
    targetLiters: number;
  };
  sleep: {
    nights: { date: string; hours: number }[];
    nightsMet: number;
    nightsLogged: number;
    avgHours: number | null;
    targetHours: number;
  };
  training: {
    strengthCount: number;
    cardioCount: number;
    sessions: Pick<Workout, "localDate" | "title" | "isCardio" | "exerciseType">[];
    strengthTarget: number;
    cardioTarget: number;
  };
}

/** Everything the dashboard/check-in needs for one Monday-start week. */
export async function weekStats(accountId: number, weekStart: string): Promise<WeekStats> {
  const db = await getDb();
  const dates = weekDates(weekStart);
  const weekEnd = dates[6];
  const prevWeekStart = addDays(weekStart, -7);

  const [protocol, targets, nutritionDays, weightsTwoWeeks, waterRows, sleepRows, workoutRows] =
    await Promise.all([
      getActiveProtocol(accountId),
      getTargets(accountId),
      dailyMacros(accountId, weekStart, weekEnd),
      dailyWeights(accountId, prevWeekStart, weekEnd),
      db
        .select({
          date: hydrationEntries.localDate,
          volumeMl: sql<number>`sum(${hydrationEntries.volumeMl})`.mapWith(Number),
        })
        .from(hydrationEntries)
        .where(
          and(
            eq(hydrationEntries.accountId, accountId),
            gte(hydrationEntries.localDate, weekStart),
            lte(hydrationEntries.localDate, weekEnd),
          ),
        )
        .groupBy(hydrationEntries.localDate)
        .orderBy(asc(hydrationEntries.localDate)),
      db
        .select({
          date: sleepSessions.localDate,
          minutes: sql<number>`sum(${sleepSessions.durationMin})`.mapWith(Number),
        })
        .from(sleepSessions)
        .where(
          and(
            eq(sleepSessions.accountId, accountId),
            gte(sleepSessions.localDate, weekStart),
            lte(sleepSessions.localDate, weekEnd),
          ),
        )
        .groupBy(sleepSessions.localDate)
        .orderBy(asc(sleepSessions.localDate)),
      db
        .select()
        .from(workouts)
        .where(
          and(
            eq(workouts.accountId, accountId),
            gte(workouts.localDate, weekStart),
            lte(workouts.localDate, weekEnd),
          ),
        )
        .orderBy(asc(workouts.localDate)),
    ]);

  // Nutrition adherence vs the active protocol.
  const daysLogged = nutritionDays.length;
  let avg = null;
  let onTargetDays: number | null = null;
  let avgCaloriesDeltaPct: number | null = null;
  if (daysLogged > 0) {
    avg = {
      calories: Math.round(
        nutritionDays.reduce((s, d) => s + d.calories, 0) / daysLogged,
      ),
      proteinG: Math.round(
        nutritionDays.reduce((s, d) => s + d.proteinG, 0) / daysLogged,
      ),
      carbsG: Math.round(
        nutritionDays.reduce((s, d) => s + d.carbsG, 0) / daysLogged,
      ),
      fatG: Math.round(nutritionDays.reduce((s, d) => s + d.fatG, 0) / daysLogged),
    };
    if (protocol?.calories) {
      avgCaloriesDeltaPct = round1(
        ((avg.calories - protocol.calories) / protocol.calories) * 100,
      );
      onTargetDays = nutritionDays.filter((d) => {
        const calOk =
          Math.abs(d.calories - protocol.calories!) / protocol.calories! <= 0.05;
        const proteinOk =
          protocol.proteinG == null || d.proteinG >= protocol.proteinG - 10;
        return calOk && proteinOk;
      }).length;
    }
  }

  // Weight trend: this week's average vs previous week's average.
  const thisWeek = weightsTwoWeeks.filter((w) => w.date >= weekStart);
  const prevWeek = weightsTwoWeeks.filter((w) => w.date < weekStart);
  const mean = (xs: WeightPoint[]) =>
    xs.length ? round1(xs.reduce((s, x) => s + x.weightLbs, 0) / xs.length) : null;
  const avgThisWeek = mean(thisWeek);
  const avgPrevWeek = mean(prevWeek);

  const waterTargetMl = targets.waterMlMin;
  const sleepNights = sleepRows.map((r) => ({
    date: r.date,
    hours: round1(r.minutes / 60),
  }));

  const strength = workoutRows.filter((w) => !w.isCardio);
  const cardio = workoutRows.filter((w) => w.isCardio);

  return {
    weekStart,
    weekEnd,
    protocol,
    targets,
    nutrition: { days: nutritionDays, daysLogged, avg, onTargetDays, avgCaloriesDeltaPct },
    weight: {
      latest: thisWeek.at(-1) ?? prevWeek.at(-1) ?? null,
      avgThisWeek,
      avgPrevWeek,
      weeklyChangeLbs:
        avgThisWeek != null && avgPrevWeek != null
          ? round1(avgThisWeek - avgPrevWeek)
          : null,
    },
    water: {
      days: waterRows,
      daysMet: waterRows.filter((r) => r.volumeMl >= waterTargetMl).length,
      daysLogged: waterRows.length,
      avgLiters: waterRows.length
        ? round1(waterRows.reduce((s, r) => s + r.volumeMl, 0) / waterRows.length / 1000)
        : null,
      targetLiters: waterTargetMl / 1000,
    },
    sleep: {
      nights: sleepNights,
      nightsMet: sleepNights.filter((n) => n.hours >= targets.sleepHoursMin).length,
      nightsLogged: sleepNights.length,
      avgHours: sleepNights.length
        ? round1(sleepNights.reduce((s, n) => s + n.hours, 0) / sleepNights.length)
        : null,
      targetHours: targets.sleepHoursMin,
    },
    training: {
      strengthCount: strength.length,
      cardioCount: cardio.length,
      sessions: workoutRows.map((w) => ({
        localDate: w.localDate,
        title: w.title,
        isCardio: w.isCardio,
        exerciseType: w.exerciseType,
      })),
      strengthTarget: targets.workoutsPerWeekMin,
      cardioTarget: targets.cardioSessionsPerWeek,
    },
  };
}

export interface DashboardData {
  settings: Settings;
  protocol: Protocol | null;
  daysToTarget: number | null;
  latestWeight: WeightPoint | null;
  weightSeries: WeightPoint[];
  weightTrend: WeightPoint[];
  compliance: DayMacros[];
  weeklyChangeLbs: number | null;
}

export async function dashboardData(accountId: number): Promise<DashboardData> {
  const s = await getSettings(accountId);
  const today = todayLocal(s.timezone);
  const [protocol, weights, compliance] = await Promise.all([
    getActiveProtocol(accountId),
    dailyWeights(accountId, addDays(today, -90), today),
    dailyMacros(accountId, addDays(today, -13), today),
  ]);

  const last7 = weights.filter((w) => w.date > addDays(today, -7));
  const prev7 = weights.filter(
    (w) => w.date <= addDays(today, -7) && w.date > addDays(today, -14),
  );
  const mean = (xs: WeightPoint[]) =>
    xs.length ? round1(xs.reduce((a, x) => a + x.weightLbs, 0) / xs.length) : null;
  const a = mean(last7);
  const b = mean(prev7);

  return {
    settings: s,
    protocol,
    daysToTarget: s.targetDate ? daysBetween(today, s.targetDate) : null,
    latestWeight: weights.at(-1) ?? null,
    weightSeries: weights,
    weightTrend: rollingAvg(weights),
    compliance,
    weeklyChangeLbs: a != null && b != null ? round1(a - b) : null,
  };
}
