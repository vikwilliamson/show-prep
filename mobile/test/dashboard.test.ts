import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { fetchDashboard, FETCH_TIMEOUT_MS } from "../src/dashboard";
import type { CompanionConfig } from "../src/config";

const REFERENCE_ID = "80971019-5064-4009-b9e9-1b34f94e1284";

const baseConfig: CompanionConfig = {
  serverUrl: "https://prep.example.com",
  apiKey: "k",
  referenceId: REFERENCE_ID,
  deviceId: "galaxy-x",
};

const apiPayload = {
  dashboard: {
    settings: { targetName: "Beach trip", targetDate: "2026-12-01", targetWeightLbs: 180 },
    nutritionTarget: {
      calories: 2100,
      proteinG: 210,
      carbsG: 185,
      fatG: 55,
      source: "protocol" as const,
      effectiveFrom: "2026-07-06",
    },
    daysToTarget: 30,
    latestWeight: { date: "2026-09-14", weightLbs: 185.5 },
    weeklyChangeLbs: -0.6,
  },
  stats: {
    water: { daysLogged: 5, daysMet: 4, avgLiters: 3.1, targetLiters: 3 },
    sleep: { nightsLogged: 5, nightsMet: 3, avgHours: 6.8, targetHours: 7 },
    training: { strengthCount: 3, cardioCount: 2, strengthTarget: 3, cardioTarget: 4 },
  },
};

let originalFetch: typeof globalThis.fetch = globalThis.fetch;
beforeEach(() => {
});

interface FetchCall {
  url: string;
  headers: Record<string, string>;
}

function installFetch(respond: () => { ok: boolean; status?: number; json?: unknown }): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const r = respond();
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      async json() {
        return r.json;
      },
      async text() {
        return r.ok ? "" : "server said no";
      },
    };
  }) as unknown as typeof globalThis.fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("refuses to fetch when the server URL is unset", async () => {
  const calls = installFetch(() => ({ ok: true, json: apiPayload }));
  await assert.rejects(
    () => fetchDashboard({ ...baseConfig, serverUrl: "" }),
    /Server URL not configured/,
  );
  assert.equal(calls.length, 0);
});

test("refuses to fetch when the pairing ID is unset", async () => {
  const calls = installFetch(() => ({ ok: true, json: apiPayload }));
  await assert.rejects(
    () => fetchDashboard({ ...baseConfig, referenceId: "" }),
    /Pairing ID not configured/,
  );
  assert.equal(calls.length, 0);
});

test("requests the mobile dashboard route with the referenceId and bearer token", async () => {
  const calls = installFetch(() => ({ ok: true, json: apiPayload }));

  await fetchDashboard(baseConfig);

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `https://prep.example.com/api/mobile/dashboard?referenceId=${REFERENCE_ID}`,
  );
  assert.equal(calls[0].headers.Authorization, "Bearer k");
});

test("omits the Authorization header when no API key is set", async () => {
  const calls = installFetch(() => ({ ok: true, json: apiPayload }));
  await fetchDashboard({ ...baseConfig, apiKey: "" });
  assert.equal(calls[0].headers.Authorization, undefined);
});

test("trims a trailing slash from the server URL", async () => {
  const calls = installFetch(() => ({ ok: true, json: apiPayload }));
  await fetchDashboard({ ...baseConfig, serverUrl: "https://prep.example.com/" });
  assert.ok(!calls[0].url.includes("//api/"));
});

test("summarizes the API response into the screen's flat shape", async () => {
  installFetch(() => ({ ok: true, json: apiPayload }));

  const summary = await fetchDashboard(baseConfig);

  assert.deepEqual(summary, {
    targetName: "Beach trip",
    targetDate: "2026-12-01",
    daysToTarget: 30,
    currentWeightLbs: 185.5,
    weeklyChangeLbs: -0.6,
    targetWeightLbs: 180,
    nutritionTarget: {
      calories: 2100,
      proteinG: 210,
      carbsG: 185,
      fatG: 55,
      source: "protocol",
      effectiveFrom: "2026-07-06",
    },
    water: apiPayload.stats.water,
    sleep: apiPayload.stats.sleep,
    training: apiPayload.stats.training,
  });
});

test("handles no nutrition target at all and no synced weight yet", async () => {
  installFetch(() => ({
    ok: true,
    json: {
      ...apiPayload,
      dashboard: { ...apiPayload.dashboard, nutritionTarget: null, latestWeight: null },
    },
  }));

  const summary = await fetchDashboard(baseConfig);
  assert.equal(summary.nutritionTarget, null);
  assert.equal(summary.currentWeightLbs, null);
});

test("passes through a manual-source nutrition target (no active protocol)", async () => {
  const manualTarget = {
    calories: 2200,
    proteinG: 180,
    carbsG: 220,
    fatG: 70,
    source: "manual" as const,
    effectiveFrom: null,
  };
  installFetch(() => ({
    ok: true,
    json: {
      ...apiPayload,
      dashboard: { ...apiPayload.dashboard, nutritionTarget: manualTarget },
    },
  }));

  const summary = await fetchDashboard(baseConfig);
  assert.deepEqual(summary.nutritionTarget, manualTarget);
});

test("a non-ok response throws with status and body", async () => {
  installFetch(() => ({ ok: false, status: 401 }));
  await assert.rejects(() => fetchDashboard(baseConfig), /Dashboard fetch failed \(401\)/);
});

test(
  "a fetch that never settles times out instead of hanging forever",
  { timeout: 5_000 },
  async (t) => {
    globalThis.fetch = ((_url: string, init: any) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    }) as unknown as typeof globalThis.fetch;

    t.mock.timers.enable({ apis: ["setTimeout"] });

    const resultPromise = fetchDashboard(baseConfig);
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(FETCH_TIMEOUT_MS);

    await assert.rejects(() => resultPromise, /timed out/);
  },
);
