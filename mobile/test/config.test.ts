import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  getCursor,
  loadConfig,
  loadStatus,
  saveConfig,
  saveStatus,
  setCursor,
} from "../src/config";
import AsyncStorageMock, { __dump, __reset } from "./mocks/async-storage";
import { __reset as __resetConstants, __setExtra } from "./mocks/expo-constants";

beforeEach(() => {
  __reset();
  __resetConstants();
});

test("loadConfig defaults serverUrl/apiKey from the baked-in expo-constants extra config, not empty strings", async () => {
  __setExtra({ serverUrl: "https://prep.example.com", apiKey: "test-api-key" });
  const config = await loadConfig();
  assert.equal(config.serverUrl, "https://prep.example.com");
  assert.equal(config.apiKey, "test-api-key");
  assert.equal(config.referenceId, "");
  assert.match(config.deviceId, /^galaxy-[a-z0-9]{1,6}$/);
});

test("loadConfig falls back to empty strings when the baked-in extra config is missing serverUrl/apiKey", async () => {
  __setExtra({});
  const config = await loadConfig();
  assert.equal(config.serverUrl, "");
  assert.equal(config.apiKey, "");
});

test("saveConfig round-trips referenceId/deviceId, but never persists serverUrl/apiKey to storage", async () => {
  await saveConfig({
    serverUrl: "https://prep.example.com",
    apiKey: "secret",
    referenceId: "80971019-5064-4009-b9e9-1b34f94e1284",
    deviceId: "galaxy-abc123",
  });

  const raw = __dump().get("companion.config");
  assert.ok(raw, "expected a stored config record");
  assert.deepEqual(JSON.parse(raw!), {
    referenceId: "80971019-5064-4009-b9e9-1b34f94e1284",
    deviceId: "galaxy-abc123",
  });

  const config = await loadConfig();
  assert.deepEqual(config, {
    serverUrl: "https://prep.example.com",
    apiKey: "test-api-key",
    referenceId: "80971019-5064-4009-b9e9-1b34f94e1284",
    deviceId: "galaxy-abc123",
  });
});

test("loadConfig ignores a legacy stored serverUrl/apiKey (from before serverUrl/apiKey became build-baked, VIK-113) and uses the current build's baked-in values instead", async () => {
  // Simulates a device that still has an old, full config blob in
  // AsyncStorage from before VIK-113 — back when App.tsx had manually-typed
  // Server URL/API key fields. Written directly via the storage mock,
  // bypassing saveConfig(), since saveConfig() itself never writes this
  // shape anymore (see the test above) — this is what's *already sitting*
  // on an upgraded device, not something current code would produce.
  await AsyncStorageMock.setItem(
    "companion.config",
    JSON.stringify({
      serverUrl: "http://192.168.1.10:3210",
      apiKey: "stale-dev-key",
      referenceId: "80971019-5064-4009-b9e9-1b34f94e1284",
      deviceId: "galaxy-abc123",
    }),
  );
  __setExtra({ serverUrl: "https://prep.example.com", apiKey: "current-prod-key" });

  const config = await loadConfig();
  assert.equal(config.serverUrl, "https://prep.example.com");
  assert.equal(config.apiKey, "current-prod-key");
  assert.equal(config.referenceId, "80971019-5064-4009-b9e9-1b34f94e1284");
  assert.equal(config.deviceId, "galaxy-abc123");
});

test("cursors are per-type and start null", async () => {
  assert.equal(await getCursor("nutrition"), null);
  await setCursor("nutrition", "2026-08-01T00:00:00Z");
  await setCursor("weight", "2026-08-02T00:00:00Z");
  assert.equal(await getCursor("nutrition"), "2026-08-01T00:00:00Z");
  assert.equal(await getCursor("weight"), "2026-08-02T00:00:00Z");
  assert.equal(await getCursor("sleep"), null);
});

test("status defaults to nulls and round-trips", async () => {
  assert.deepEqual(await loadStatus(), { lastRunAt: null, lastResult: null });
  await saveStatus({ lastRunAt: "2026-08-11T10:00:00Z", lastResult: "nutrition: 12" });
  assert.deepEqual(await loadStatus(), {
    lastRunAt: "2026-08-11T10:00:00Z",
    lastResult: "nutrition: 12",
  });
});
