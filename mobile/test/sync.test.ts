import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { loadStatus, saveConfig, setCursor, getCursor } from "../src/config";
import { runSync } from "../src/sync";
import { __reset as resetStorage } from "./mocks/async-storage";
import { __readCalls, __reset as resetHc, __setRecords } from "./mocks/react-native-health-connect";

const DAY_MS = 24 * 60 * 60 * 1000;
const recent = () => new Date(Date.now() - 3_600_000).toISOString();

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: { deviceId: string; source: string; records: unknown[] };
}

type Responder = (url: string, body: FetchCall["body"]) => {
  ok: boolean;
  status?: number;
  accepted?: number;
};

let originalFetch: typeof globalThis.fetch;

/** Installs a recording fetch stub; returns the array of captured calls. */
function installFetch(responder: Responder = () => ({ ok: true })): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ url, method: init.method, headers: init.headers, body });
    const r = responder(url, body);
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      async json() {
        return { accepted: r.accepted ?? body.records.length };
      },
      async text() {
        return r.ok ? "" : "server said no";
      },
    };
  }) as unknown as typeof globalThis.fetch;
  return calls;
}

function seedNutrition() {
  __setRecords("Nutrition", [
    {
      metadata: { id: "n1" },
      startTime: recent(),
      mealType: 1,
      energy: { inKilocalories: 500 },
    },
  ]);
}

/**
 * Populate every legacy HC record type the old six-type pipeline used to
 * read, including the five now-dropped ones. Used to prove the sync plan is
 * narrowed to nutrition only — not just that nutrition still works.
 */
function seedLegacyNonNutritionTypes() {
  const t = recent();
  __setRecords("Weight", [{ metadata: { id: "w1" }, time: t, weight: { inKilograms: 88 } }]);
  __setRecords("Hydration", [{ metadata: { id: "h1" }, startTime: t, volume: { inLiters: 0.5 } }]);
  __setRecords("SleepSession", [{ metadata: { id: "s1" }, startTime: t, endTime: t }]);
  __setRecords("ExerciseSession", [
    { metadata: { id: "e1" }, startTime: t, endTime: t, exerciseType: 79, title: "walk" },
  ]);
  __setRecords("Steps", [{ startTime: t, count: 8000 }]);
  __setRecords("TotalCaloriesBurned", [{ startTime: t, energy: { inKilocalories: 2200 } }]);
}

beforeEach(() => {
  resetStorage();
  resetHc();
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("refuses to sync when the server URL is unset", async () => {
  const calls = installFetch();
  const result = await runSync();
  assert.deepEqual(result, { ok: false, detail: "Server URL not configured." });
  assert.equal(calls.length, 0);
});

test("the sync plan is narrowed to nutrition only", async () => {
  await saveConfig({ serverUrl: "https://prep.example.com", apiKey: "k", deviceId: "galaxy-x" });
  seedNutrition();
  // Data is present for the old five types too — the narrowed plan must
  // never read or post any of it.
  seedLegacyNonNutritionTypes();
  const calls = installFetch();

  const result = await runSync();

  assert.equal(result.detail, "nutrition: 1");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/api/ingest/nutrition"));

  const readTypes = new Set(__readCalls.map((c) => c.recordType));
  assert.deepEqual([...readTypes], ["Nutrition"]);

  for (const type of ["weight", "hydration", "sleep", "exercise", "activity"]) {
    assert.equal(await getCursor(type), null, `${type} cursor should never be set`);
  }
});

test("happy path posts nutrition and records status + cursor", async () => {
  await saveConfig({ serverUrl: "https://prep.example.com", apiKey: "k", deviceId: "galaxy-x" });
  seedNutrition();
  const calls = installFetch();

  const result = await runSync();

  assert.equal(result.ok, true);
  assert.equal(result.detail, "nutrition: 1");

  assert.equal(calls.length, 1);
  const nutrition = calls[0];
  assert.equal(nutrition.method, "POST");
  assert.equal(nutrition.headers.Authorization, "Bearer k");
  assert.equal(nutrition.headers["Content-Type"], "application/json");
  assert.equal(nutrition.body.deviceId, "galaxy-x");
  assert.equal(nutrition.body.source, "myfitnesspal");

  const status = await loadStatus();
  assert.ok(status.lastRunAt);
  assert.equal(status.lastResult, result.detail);
  assert.ok(await getCursor("nutrition"));
});

test("omits the Authorization header when no API key is set", async () => {
  await saveConfig({ serverUrl: "https://prep.example.com", apiKey: "", deviceId: "galaxy-x" });
  seedNutrition();
  const calls = installFetch();
  await runSync();
  assert.equal(calls[0].headers.Authorization, undefined);
});

test("trims a trailing slash from the server URL", async () => {
  await saveConfig({ serverUrl: "https://prep.example.com/", apiKey: "", deviceId: "d" });
  seedNutrition();
  const calls = installFetch();
  await runSync();
  assert.ok(calls.every((c) => !c.url.includes("//api/")));
  assert.ok(calls.some((c) => c.url === "https://prep.example.com/api/ingest/nutrition"));
});

test("first sync reaches back 30 days", async () => {
  await saveConfig({ serverUrl: "https://prep.example.com", apiKey: "", deviceId: "d" });
  seedNutrition();
  installFetch();

  const before = Date.now();
  await runSync();
  const after = Date.now();

  const nutritionStart = new Date(
    __readCalls.find((c) => c.recordType === "Nutrition")!.options.timeRangeFilter!.startTime,
  ).getTime();
  const expectedFirst = before - 30 * DAY_MS;
  assert.ok(Math.abs(nutritionStart - expectedFirst) < after - before + 2000);
});

test("later syncs re-read a 24h overlap before the last cursor", async () => {
  await saveConfig({ serverUrl: "https://prep.example.com", apiKey: "", deviceId: "d" });
  seedNutrition();
  const cursorIso = new Date(Date.now() - 5 * DAY_MS).toISOString();
  await setCursor("nutrition", cursorIso);
  installFetch();

  await runSync();

  const nutritionStart = __readCalls.find((c) => c.recordType === "Nutrition")!.options
    .timeRangeFilter!.startTime;
  assert.equal(nutritionStart, new Date(new Date(cursorIso).getTime() - DAY_MS).toISOString());
});

test("a sync failure is reported and the cursor is not advanced", async () => {
  await saveConfig({ serverUrl: "https://prep.example.com", apiKey: "", deviceId: "d" });
  seedNutrition();
  installFetch(() => ({ ok: false, status: 500 }));

  const result = await runSync();

  assert.equal(result.ok, false);
  assert.match(result.detail, /^nutrition: ERROR .*500/);
  assert.equal(await getCursor("nutrition"), null);
});

test("batches posts over 500 records and sums accepted counts", async () => {
  await saveConfig({ serverUrl: "https://prep.example.com", apiKey: "", deviceId: "d" });
  const many = Array.from({ length: 501 }, (_, i) => ({
    metadata: { id: `n${i}` },
    startTime: recent(),
    mealType: 1,
    energy: { inKilocalories: 400 },
  }));
  __setRecords("Nutrition", many);
  const calls = installFetch();

  const result = await runSync();

  const nutritionCalls = calls.filter((c) => c.url.endsWith("/nutrition"));
  assert.equal(nutritionCalls.length, 2); // 500 + 1
  assert.equal(nutritionCalls[0].body.records.length, 500);
  assert.equal(nutritionCalls[1].body.records.length, 1);
  assert.match(result.detail, /nutrition: 501/);
});

test("no records makes no request but still advances the cursor", async () => {
  await saveConfig({ serverUrl: "https://prep.example.com", apiKey: "", deviceId: "d" });
  __setRecords("Nutrition", []);
  const calls = installFetch();

  const result = await runSync();

  assert.ok(result.ok);
  assert.equal(result.detail, "nutrition: 0");
  assert.equal(calls.length, 0);
  assert.ok(await getCursor("nutrition"), "empty sync should still advance its cursor");
});
