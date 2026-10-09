import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { isCardioType } from "../lib/ingest/schemas";
import { normalizeWebhookEvent, parseWebhookEvent } from "../lib/health-webhook/normalize";

// Fixtures mirror what Open Wearables' real emitters produce (see
// backend/app/services/outgoing_webhooks/events.py and
// backend/app/constants/webhooks/test_payloads.py in the open-wearables
// checkout): `{ type, data }`, identifying the user ONLY by the aggregator's
// own user_id.

const USER = "00000000-0000-0000-0000-000000000002";
const TZ = "America/Los_Angeles";

function parsed(body: unknown) {
  const result = parseWebhookEvent(body);
  assert.equal(result.status, "handled", JSON.stringify(result));
  return result;
}

const series = (type: string, series_type: string, samples: object[], provider = "apple") => ({
  type,
  data: {
    user_id: USER,
    provider,
    series_type,
    sample_count: samples.length,
    start_time: "2026-10-01T08:00:00+00:00",
    end_time: "2026-10-01T09:00:00+00:00",
    samples,
  },
});

const sample = (timestamp: string, value: number, unit: string, extra: object = {}) => ({
  timestamp,
  zone_offset: "+00:00",
  value,
  unit,
  source: { provider: "apple", device: null },
  is_daily_total: null,
  ...extra,
});

describe("parseWebhookEvent", () => {
  test("surfaces the aggregator user_id and event type for a handled event", () => {
    const r = parsed(series("body_composition.created", "weight", [sample("2026-10-01T14:00:00+00:00", 80, "kg")]));
    assert.equal(r.status === "handled" && r.userId, USER);
    assert.equal(r.status === "handled" && r.type, "body_composition.created");
  });

  test("acks (ignores) events that carry no data we store", () => {
    for (const body of [
      { type: "connection.created", data: { user_id: USER, provider: "apple" } },
      { type: "sync.completed", data: { user_id: USER } },
      { type: "menstrual_cycle.created", data: { id: "x", user_id: USER } },
      series("heart_rate.created", "heart_rate", [sample("2026-10-01T14:00:00+00:00", 70, "bpm")]),
    ]) {
      assert.equal(parseWebhookEvent(body).status, "ignored", JSON.stringify(body).slice(0, 60));
    }
  });

  test("rejects a handled event type whose payload is malformed", () => {
    assert.equal(parseWebhookEvent({ type: "sleep.created", data: { user_id: USER } }).status, "invalid");
    assert.equal(parseWebhookEvent({ type: "workout.created", data: { id: "x" } }).status, "invalid");
    assert.equal(parseWebhookEvent("not an object").status, "invalid");
    assert.equal(parseWebhookEvent({ data: {} }).status, "invalid");
  });
});

describe("normalizeWebhookEvent", () => {
  test("sleep.created -> a sleep session attributed to the wake-up date in the account's timezone", () => {
    const out = normalizeWebhookEvent(
      parsed({
        type: "sleep.created",
        data: {
          id: "sleep-rec-1",
          user_id: USER,
          start_time: "2026-10-01T05:00:00+00:00",
          end_time: "2026-10-01T13:30:00+00:00",
          zone_offset: "+00:00",
          duration_seconds: 30600,
          source: { provider: "oura", device: "Oura Ring" },
          efficiency_percent: 88.5,
          stages: { awake_minutes: 12, light_minutes: 210, deep_minutes: 90, rem_minutes: 95 },
          is_nap: false,
        },
      }),
      TZ,
    );
    assert.equal(out.sleep.length, 1);
    const [s] = out.sleep;
    assert.equal(s.providerUid, "sleep-rec-1");
    assert.equal(s.source, "open_wearables_oura");
    assert.equal(s.localDate, "2026-10-01"); // 13:30Z = 06:30 PDT
    assert.equal(s.durationMin, 510);
    assert.equal(s.startedAt.toISOString(), "2026-10-01T05:00:00.000Z");
    assert.deepEqual(s.stages, { awake_minutes: 12, light_minutes: 210, deep_minutes: 90, rem_minutes: 95 });
  });

  test("sleep.created skips naps so they don't inflate a night's sleep total", () => {
    const out = normalizeWebhookEvent(
      parsed({
        type: "sleep.created",
        data: {
          id: "nap-1",
          user_id: USER,
          start_time: "2026-10-01T20:00:00+00:00",
          end_time: "2026-10-01T20:30:00+00:00",
          duration_seconds: 1800,
          source: { provider: "apple", device: null },
          is_nap: true,
        },
      }),
      TZ,
    );
    assert.equal(out.sleep.length, 0);
  });

  test("sleep.created falls back to the start/end window when duration_seconds is absent", () => {
    const out = normalizeWebhookEvent(
      parsed({
        type: "sleep.created",
        data: {
          id: "s2",
          user_id: USER,
          start_time: "2026-10-01T05:00:00+00:00",
          end_time: "2026-10-01T12:00:00+00:00",
          duration_seconds: null,
          source: { provider: "apple", device: null },
        },
      }),
      TZ,
    );
    assert.equal(out.sleep[0].durationMin, 420);
  });

  test("workout.created -> a workout row with cardio derived from the type", () => {
    const out = normalizeWebhookEvent(
      parsed({
        type: "workout.created",
        data: {
          id: "workout-rec-1",
          user_id: USER,
          type: "running",
          start_time: "2026-10-01T15:00:00+00:00",
          end_time: "2026-10-01T16:00:00+00:00",
          duration_seconds: 3600,
          source: { provider: "garmin", device: "Fenix 7" },
          calories_kcal: 450,
        },
      }),
      TZ,
    );
    assert.equal(out.workouts.length, 1);
    const [w] = out.workouts;
    assert.equal(w.providerUid, "workout-rec-1");
    assert.equal(w.source, "open_wearables_garmin");
    assert.equal(w.exerciseType, "running");
    assert.equal(w.isCardio, true);
    assert.equal(w.caloriesBurned, 450);
    assert.equal(w.localDate, "2026-10-01");
    assert.equal(w.endedAt?.toISOString(), "2026-10-01T16:00:00.000Z");
  });

  test("workout.created with no type or calories still lands, as a non-cardio 'other'", () => {
    const out = normalizeWebhookEvent(
      parsed({
        type: "workout.created",
        data: {
          id: "w2",
          user_id: USER,
          type: null,
          start_time: "2026-10-01T15:00:00+00:00",
          end_time: "2026-10-01T16:00:00+00:00",
          source: { provider: "apple", device: null },
          calories_kcal: null,
        },
      }),
      TZ,
    );
    assert.equal(out.workouts[0].exerciseType, "other");
    assert.equal(out.workouts[0].isCardio, false);
    assert.equal(out.workouts[0].caloriesBurned, null);
  });

  test("a body-composition weight batch -> weight rows in lbs, one per sample, with deterministic IDs", () => {
    const body = series("body_composition.created", "weight", [
      sample("2026-10-01T14:00:00+00:00", 80, "kg"),
      sample("2026-10-02T14:00:00+00:00", 79.5, "kg"),
    ]);
    const out = normalizeWebhookEvent(parsed(body), TZ);
    assert.equal(out.weights.length, 2);
    assert.equal(out.weights[0].weightLbs, 176.4);
    assert.equal(out.weights[0].source, "open_wearables_apple");
    assert.equal(out.weights[0].localDate, "2026-10-01");
    assert.equal(out.weights[0].measuredAt.toISOString(), "2026-10-01T14:00:00.000Z");
    // Same payload twice -> same IDs (record-level idempotency depends on it).
    const again = normalizeWebhookEvent(parsed(body), TZ);
    assert.deepEqual(
      again.weights.map((w) => w.providerUid),
      out.weights.map((w) => w.providerUid),
    );
    assert.notEqual(out.weights[0].providerUid, out.weights[1].providerUid);
  });

  test("the granular series.weight.created event is handled the same as the group event", () => {
    const out = normalizeWebhookEvent(
      parsed(series("series.weight.created", "weight", [sample("2026-10-01T14:00:00+00:00", 80, "kg")])),
      TZ,
    );
    assert.equal(out.weights.length, 1);
  });

  test("non-weight body-composition series (height, body fat, BMI) are ignored", () => {
    for (const st of ["height", "body_fat_percentage", "body_mass_index"]) {
      assert.equal(
        parseWebhookEvent(series("body_composition.created", st, [sample("2026-10-01T14:00:00+00:00", 20, "%")])).status,
        "ignored",
        st,
      );
    }
  });

  test("weight samples in unknown units or out-of-range values are skipped and counted, not stored", () => {
    const out = normalizeWebhookEvent(
      parsed(
        series("body_composition.created", "weight", [
          sample("2026-10-01T14:00:00+00:00", 80, "stone"),
          sample("2026-10-02T14:00:00+00:00", 5000, "kg"),
          sample("2026-10-03T14:00:00+00:00", 80, "kg"),
        ]),
      ),
      TZ,
    );
    assert.equal(out.weights.length, 1);
    assert.equal(out.skipped, 2);
  });

  test("hydration (arrives under the activity_timeseries group) -> hydration rows in ml", () => {
    const out = normalizeWebhookEvent(
      parsed(
        series(
          "activity_timeseries.created",
          "hydration",
          [sample("2026-10-01T14:00:00+00:00", 500, "ml"), sample("2026-10-01T18:00:00+00:00", 0.75, "L")],
          "google",
        ),
      ),
      TZ,
    );
    assert.equal(out.hydration.length, 2);
    assert.equal(out.hydration[0].volumeMl, 500);
    assert.equal(out.hydration[1].volumeMl, 750);
    assert.equal(out.hydration[0].source, "open_wearables_google");
    assert.equal(out.hydration[0].localDate, "2026-10-01");
    assert.notEqual(out.hydration[0].providerUid, out.hydration[1].providerUid);
  });

  test("other activity_timeseries series (stand time, distance) are ignored", () => {
    assert.equal(
      parseWebhookEvent(series("activity_timeseries.created", "stand_time", [sample("2026-10-01T14:00:00+00:00", 45, "min")]))
        .status,
      "ignored",
    );
  });

  test("steps -> a daily-activity row only from daily-total samples", () => {
    const out = normalizeWebhookEvent(
      parsed(
        series("steps.created", "steps", [
          sample("2026-10-01T14:00:00+00:00", 1200, "count", { is_daily_total: false }),
          sample("2026-10-01T22:00:00+00:00", 8432, "count", { is_daily_total: true }),
        ]),
      ),
      TZ,
    );
    assert.deepEqual(out.activity, [{ localDate: "2026-10-01", source: "open_wearables_apple", steps: 8432 }]);
    assert.equal(out.skipped, 1);
  });

  test("interval steps with no daily total are not summed into a day (summing isn't idempotent)", () => {
    const out = normalizeWebhookEvent(
      parsed(series("steps.created", "steps", [sample("2026-10-01T14:00:00+00:00", 1200, "count")])),
      TZ,
    );
    assert.equal(out.activity.length, 0);
  });

  test("energy daily total -> activeCalories", () => {
    const out = normalizeWebhookEvent(
      parsed(
        series("calories.created", "energy", [
          sample("2026-10-01T22:00:00+00:00", 640, "kcal", { is_daily_total: true }),
        ]),
      ),
      TZ,
    );
    assert.deepEqual(out.activity, [{ localDate: "2026-10-01", source: "open_wearables_apple", activeCalories: 640 }]);
  });

  test("with several daily totals for one day, the latest sample wins", () => {
    const out = normalizeWebhookEvent(
      parsed(
        series("steps.created", "steps", [
          sample("2026-10-01T22:00:00+00:00", 9000, "count", { is_daily_total: true }),
          sample("2026-10-01T18:00:00+00:00", 5000, "count", { is_daily_total: true }),
        ]),
      ),
      TZ,
    );
    assert.equal(out.activity.length, 1);
    assert.equal(out.activity[0].steps, 9000);
  });

  test("the provider name is sanitized into the source value", () => {
    const out = normalizeWebhookEvent(
      parsed(series("body_composition.created", "weight", [sample("2026-10-01T14:00:00+00:00", 80, "kg")], "Samsung Health!")),
      TZ,
    );
    assert.equal(out.weights[0].source, "open_wearables_samsung_health");
  });

  test("a batch larger than the aggregator's own 2,500-sample chunk limit is rejected", () => {
    const many = Array.from({ length: 2501 }, (_, i) => sample(`2026-10-01T14:00:${String(i % 60).padStart(2, "0")}+00:00`, 80, "kg"));
    assert.equal(parseWebhookEvent(series("body_composition.created", "weight", many)).status, "invalid");
  });
});

describe("isCardioType covers the aggregator's workout vocabulary", () => {
  test("cycling and swimming slugs are cardio", () => {
    for (const t of ["cycling", "cycling_stationary", "swimming", "running", "walking"]) {
      assert.equal(isCardioType(t), true, t);
    }
    assert.equal(isCardioType("strength_training"), false);
  });
});
