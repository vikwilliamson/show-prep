import { z } from "zod";
import { localDateOf } from "../dates";
import { isCardioType } from "../ingest/schemas";

// Parsing + normalization for POST /api/health-webhook. Pure — no DB, no
// request objects — so every event type is testable with a plain fixture.
//
// Payload shapes come from Open Wearables' own emitters
// (backend/app/services/outgoing_webhooks/events.py): `{ type, data }`, where
// `data.user_id` is the aggregator's OWN user ID. Events never carry our
// referenceId (see specs/phase-2-open-wearables.md's 2026-10-09 addendum).

const KG_TO_LBS = 2.2046226218;
// Open Wearables splits larger timeseries batches into chunks of this size.
const MAX_SAMPLES_PER_EVENT = 2500;

const isoInstant = z.iso.datetime({ offset: true });

const source = z.object({ provider: z.string().min(1), device: z.string().nullish() });

const sleepData = z
  .object({
    id: z.string().min(1),
    user_id: z.string().min(1),
    start_time: isoInstant,
    end_time: isoInstant,
    duration_seconds: z.number().nullish(),
    source,
    stages: z.record(z.string(), z.number().nullable()).nullish(),
    is_nap: z.boolean().nullish(),
  })
  .refine((d) => Date.parse(d.end_time) > Date.parse(d.start_time), "end_time must be after start_time");

const workoutData = z
  .object({
    id: z.string().min(1),
    user_id: z.string().min(1),
    type: z.string().nullish(),
    start_time: isoInstant,
    end_time: isoInstant.nullish(),
    source,
    calories_kcal: z.number().nullish(),
  })
  .refine(
    (d) => !d.end_time || Date.parse(d.end_time) >= Date.parse(d.start_time),
    "end_time must not be before start_time",
  );

const seriesSample = z.object({
  timestamp: isoInstant,
  value: z.number(),
  unit: z.string().nullish(),
  is_daily_total: z.boolean().nullish(),
});

const seriesData = z.object({
  user_id: z.string().min(1),
  provider: z.string().min(1),
  series_type: z.string().min(1),
  samples: z.array(seriesSample).max(MAX_SAMPLES_PER_EVENT),
});

const envelope = z.object({
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

const HANDLED_SERIES = new Set(["weight", "hydration", "steps", "energy"]);

export type ParsedPayload =
  | { kind: "sleep"; data: z.infer<typeof sleepData> }
  | { kind: "workout"; data: z.infer<typeof workoutData> }
  | { kind: "series"; data: z.infer<typeof seriesData> };

export type ParseResult =
  | { status: "handled"; type: string; userId: string; payload: ParsedPayload }
  | { status: "ignored"; type: string }
  | { status: "invalid"; issues: string };

function invalid(error: z.ZodError): ParseResult {
  return { status: "invalid", issues: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

/** Classifies a verified webhook body: one we store, one we acknowledge and
 *  drop (connection/sync/heart-rate/etc. — not stored), or a malformed one
 *  of a type we do store. */
export function parseWebhookEvent(body: unknown): ParseResult {
  const env = envelope.safeParse(body);
  if (!env.success) return invalid(env.error);
  const { type, data } = env.data;

  if (type === "sleep.created") {
    const r = sleepData.safeParse(data);
    return r.success
      ? { status: "handled", type, userId: r.data.user_id, payload: { kind: "sleep", data: r.data } }
      : invalid(r.error);
  }
  if (type === "workout.created") {
    const r = workoutData.safeParse(data);
    return r.success
      ? { status: "handled", type, userId: r.data.user_id, payload: { kind: "workout", data: r.data } }
      : invalid(r.error);
  }

  // Timeseries events come as both a category event (e.g.
  // body_composition.created) and a granular series.<type>.created one; both
  // carry the same shape, so dispatch on series_type rather than the event
  // name. Upserts make receiving both harmless.
  if (type.endsWith(".created") && typeof data.series_type === "string" && Array.isArray(data.samples)) {
    if (!HANDLED_SERIES.has(data.series_type)) return { status: "ignored", type };
    const r = seriesData.safeParse(data);
    return r.success
      ? { status: "handled", type, userId: r.data.user_id, payload: { kind: "series", data: r.data } }
      : invalid(r.error);
  }

  return { status: "ignored", type };
}

export interface WeightRow {
  providerUid: string;
  source: string;
  measuredAt: Date;
  localDate: string;
  weightLbs: number;
}
export interface HydrationRow {
  providerUid: string;
  source: string;
  localDate: string;
  volumeMl: number;
}
export interface SleepRow {
  providerUid: string;
  source: string;
  localDate: string;
  startedAt: Date;
  endedAt: Date;
  durationMin: number;
  stages: Record<string, number | null> | null;
}
export interface WorkoutRow {
  providerUid: string;
  source: string;
  localDate: string;
  startedAt: Date;
  endedAt: Date | null;
  exerciseType: string;
  isCardio: boolean;
  caloriesBurned: number | null;
}
/** Only the fields a batch actually carried are present, so the upsert can
 *  leave the others on a shared (account, day) row untouched. */
export interface ActivityDay {
  localDate: string;
  source: string;
  steps?: number;
  activeCalories?: number;
}

export interface NormalizedEvent {
  weights: WeightRow[];
  hydration: HydrationRow[];
  sleep: SleepRow[];
  workouts: WorkoutRow[];
  activity: ActivityDay[];
  /** Samples dropped for an unusable unit/value, or not a daily total. */
  skipped: number;
}

/** Stored in the `source` column: `open_wearables_<underlying provider>`. */
function sourceFor(provider: string): string {
  const slug = provider
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `open_wearables_${slug || "unknown"}`;
}

function toKg(value: number, unit: string | null | undefined): number | null {
  switch ((unit ?? "").toLowerCase()) {
    case "kg":
      return value;
    case "g":
      return value / 1000;
    case "lb":
    case "lbs":
      return value / KG_TO_LBS;
    default:
      return null;
  }
}

function toMl(value: number, unit: string | null | undefined): number | null {
  switch ((unit ?? "").toLowerCase()) {
    case "ml":
      return value;
    case "l":
      return value * 1000;
    default:
      return null;
  }
}

export function normalizeWebhookEvent(
  event: Extract<ParseResult, { status: "handled" }>,
  timezone: string,
): NormalizedEvent {
  const out: NormalizedEvent = { weights: [], hydration: [], sleep: [], workouts: [], activity: [], skipped: 0 };
  const { payload } = event;

  if (payload.kind === "sleep") {
    const d = payload.data;
    if (d.is_nap) return out;
    const startedAt = new Date(d.start_time);
    const endedAt = new Date(d.end_time);
    const windowMin = (endedAt.getTime() - startedAt.getTime()) / 60_000;
    const durationMin =
      d.duration_seconds != null && d.duration_seconds >= 0 ? Math.round(d.duration_seconds / 60) : Math.round(windowMin);
    out.sleep.push({
      providerUid: d.id,
      source: sourceFor(d.source.provider),
      // A night's sleep is attributed to the wake-up date, like the ingest route.
      localDate: localDateOf(endedAt, timezone),
      startedAt,
      endedAt,
      durationMin,
      stages: d.stages ?? null,
    });
    return out;
  }

  if (payload.kind === "workout") {
    const d = payload.data;
    const exerciseType = d.type?.trim() || "other";
    const cal = d.calories_kcal;
    out.workouts.push({
      providerUid: d.id,
      source: sourceFor(d.source.provider),
      localDate: localDateOf(d.start_time, timezone),
      startedAt: new Date(d.start_time),
      endedAt: d.end_time ? new Date(d.end_time) : null,
      exerciseType,
      isCardio: isCardioType(exerciseType),
      caloriesBurned: cal != null && cal >= 0 && cal <= 20_000 ? cal : null,
    });
    return out;
  }

  const { provider, series_type, samples } = payload.data;
  const src = sourceFor(provider);
  // Latest daily-total sample per local day.
  const dailyTotals = new Map<string, { at: number; value: number }>();

  for (const s of samples) {
    const uid = `${series_type}:${provider}:${s.timestamp}`;
    const localDate = localDateOf(s.timestamp, timezone);

    if (series_type === "weight") {
      const kg = toKg(s.value, s.unit);
      if (kg == null || !(kg > 0 && kg <= 1000)) {
        out.skipped++;
        continue;
      }
      out.weights.push({
        providerUid: uid,
        source: src,
        measuredAt: new Date(s.timestamp),
        localDate,
        weightLbs: Math.round(kg * KG_TO_LBS * 10) / 10,
      });
    } else if (series_type === "hydration") {
      const ml = toMl(s.value, s.unit);
      if (ml == null || !(ml >= 0 && ml <= 20_000)) {
        out.skipped++;
        continue;
      }
      out.hydration.push({ providerUid: uid, source: src, localDate, volumeMl: ml });
    } else {
      // steps / energy -> daily_activity, one row per day. Summing interval
      // samples would double count on any redelivery or overlapping batch, so
      // only provider-reported daily totals are stored.
      const unitOk = series_type === "steps" || (s.unit ?? "").toLowerCase() === "kcal";
      const max = series_type === "steps" ? 200_000 : 20_000;
      if (s.is_daily_total !== true || !unitOk || !(s.value >= 0 && s.value <= max)) {
        out.skipped++;
        continue;
      }
      const at = Date.parse(s.timestamp);
      const prev = dailyTotals.get(localDate);
      if (!prev || at > prev.at) dailyTotals.set(localDate, { at, value: s.value });
    }
  }

  for (const [localDate, { value }] of dailyTotals) {
    out.activity.push(
      series_type === "steps"
        ? { localDate, source: src, steps: Math.round(value) }
        : { localDate, source: src, activeCalories: value },
    );
  }
  return out;
}
