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
import { __reset } from "./mocks/async-storage";
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

test("saveConfig round-trips through storage", async () => {
  await saveConfig({
    serverUrl: "https://prep.example.com",
    apiKey: "secret",
    referenceId: "80971019-5064-4009-b9e9-1b34f94e1284",
    deviceId: "galaxy-abc123",
  });
  const config = await loadConfig();
  assert.deepEqual(config, {
    serverUrl: "https://prep.example.com",
    apiKey: "secret",
    referenceId: "80971019-5064-4009-b9e9-1b34f94e1284",
    deviceId: "galaxy-abc123",
  });
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
