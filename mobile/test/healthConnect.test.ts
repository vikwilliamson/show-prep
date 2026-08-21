import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  ensureInitialized,
  readAll,
  RECORD_TYPES,
  requestAllPermissions,
} from "../src/healthConnect";
import {
  __initializeCalls,
  __permissionCalls,
  __readCalls,
  __reset,
  __setPages,
  __setRecords,
} from "./mocks/react-native-health-connect";

beforeEach(() => __reset());

test("ensureInitialized calls initialize once and memoizes", async () => {
  // First real call in this process — initialized starts false.
  assert.equal(await ensureInitialized(), true);
  assert.equal(await ensureInitialized(), true);
  assert.equal(__initializeCalls(), 1);
});

test("RECORD_TYPES is narrowed to Nutrition only", () => {
  assert.deepEqual(RECORD_TYPES, ["Nutrition"]);
});

test("requestAllPermissions requests read access to Nutrition only", async () => {
  await requestAllPermissions();
  assert.deepEqual(__permissionCalls().at(-1), [
    { accessType: "read", recordType: "Nutrition" },
  ]);
});

test("readAll follows pageTokens and concatenates every page", async () => {
  __setPages("Nutrition", [
    { records: [{ metadata: { id: "a" } }, { metadata: { id: "b" } }], pageToken: "p1" },
    { records: [{ metadata: { id: "c" } }], pageToken: undefined },
  ]);

  const out = await readAll("Nutrition", "2026-08-01T00:00:00Z", "2026-08-11T00:00:00Z");

  assert.deepEqual(
    out.map((r: any) => r.metadata.id),
    ["a", "b", "c"],
  );
  // Second page request carries the token from the first response.
  const nutritionCalls = __readCalls.filter((c) => c.recordType === "Nutrition");
  assert.equal(nutritionCalls.length, 2);
  assert.equal(nutritionCalls[0].options.pageToken, undefined);
  assert.equal(nutritionCalls[1].options.pageToken, "p1");
});

test("readAll forwards the requested time range", async () => {
  __setRecords("Nutrition", []);
  await readAll("Nutrition", "2026-08-05T00:00:00Z", "2026-08-11T00:00:00Z");
  const call = __readCalls.find((c) => c.recordType === "Nutrition");
  assert.ok(call);
  assert.deepEqual(call.options.timeRangeFilter, {
    operator: "between",
    startTime: "2026-08-05T00:00:00Z",
    endTime: "2026-08-11T00:00:00Z",
  });
});

test("readAll returns [] when a type has no records", async () => {
  __setRecords("Nutrition", []);
  assert.deepEqual(await readAll("Nutrition", "a", "z"), []);
});
