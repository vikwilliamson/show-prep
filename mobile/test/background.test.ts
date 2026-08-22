import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { registerBackgroundSync } from "../src/background";
import { __failGets, __reset as resetStorage } from "./mocks/async-storage";
import { saveConfig } from "../src/config";
import { __reset as resetHc, __setRecords } from "./mocks/react-native-health-connect";
import {
  BackgroundTaskResult,
  __registerCalls,
  __reset as resetBg,
  __setThrowOnRegister,
} from "./mocks/expo-background-task";
import { __getTask } from "./mocks/expo-task-manager";

// Importing ../src/background above ran TaskManager.defineTask at module load,
// so the sync task body is now retrievable from the task-manager mock.
const TASK_NAME = "gamma-hc-sync";
const runTask = () => __getTask(TASK_NAME)!();

const recent = () => new Date(Date.now() - 3_600_000).toISOString();

function stubFetchOk() {
  globalThis.fetch = (async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return { accepted: body.records.length };
      },
      async text() {
        return "";
      },
    };
  }) as unknown as typeof globalThis.fetch;
}

let originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  resetStorage();
  resetHc();
  resetBg();
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("defineTask registered the sync task at module load", () => {
  assert.equal(typeof __getTask(TASK_NAME), "function");
});

test("task returns Success when the sync succeeds", async () => {
  await saveConfig({
    serverUrl: "https://prep.example.com",
    apiKey: "",
    referenceId: "80971019-5064-4009-b9e9-1b34f94e1284",
    deviceId: "d",
  });
  __setRecords("Nutrition", [
    { metadata: { id: "n1" }, startTime: recent(), mealType: 1, energy: { inKilocalories: 500 } },
  ]);
  stubFetchOk();

  assert.equal(await runTask(), BackgroundTaskResult.Success);
});

test("task returns Failed when the sync reports failure", async () => {
  // No server URL configured -> runSync returns { ok: false }.
  assert.equal(await runTask(), BackgroundTaskResult.Failed);
});

test("task returns Failed (does not throw) when runSync itself throws", async () => {
  await saveConfig({
    serverUrl: "https://prep.example.com",
    apiKey: "",
    referenceId: "80971019-5064-4009-b9e9-1b34f94e1284",
    deviceId: "d",
  });
  __failGets(true); // loadConfig's getItem throws inside runSync
  assert.equal(await runTask(), BackgroundTaskResult.Failed);
});

test("registerBackgroundSync registers the task hourly", async () => {
  await registerBackgroundSync();
  assert.equal(__registerCalls.length, 1);
  assert.equal(__registerCalls[0].taskName, TASK_NAME);
  assert.deepEqual(__registerCalls[0].options, { minimumInterval: 60 });
});

test("registerBackgroundSync swallows registration errors", async () => {
  __setThrowOnRegister(true);
  await assert.doesNotReject(registerBackgroundSync());
});
