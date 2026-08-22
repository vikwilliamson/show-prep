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

beforeEach(() => __reset());

test("loadConfig returns empty defaults with a generated deviceId", async () => {
  const config = await loadConfig();
  assert.equal(config.serverUrl, "");
  assert.equal(config.apiKey, "");
  assert.equal(config.referenceId, "");
  assert.match(config.deviceId, /^galaxy-[a-z0-9]{1,6}$/);
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
