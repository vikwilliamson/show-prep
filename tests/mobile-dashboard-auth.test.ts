import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { NextRequest } from "next/server";

// proxy.ts exempts /api/mobile/* from the session-cookie gate (the companion app
// has no cookie), so this route's own bearer check is its only gate. tests/
// mobile-dashboard-route.test.ts runs with INGEST_API_KEY unset (auth open in
// local dev), so the enforced path is covered here with the key set.
const KEY = "a-perfectly-fine-ingest-key";
const UNKNOWN_REFERENCE_ID = "00000000-0000-0000-0000-000000000000";

beforeEach(() => {
  vi.stubEnv("INGEST_API_KEY", KEY);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function callRoute(headers: Record<string, string>, referenceId: string | null) {
  const { GET } = await import("../app/api/mobile/dashboard/route");
  const url = referenceId
    ? `http://localhost/api/mobile/dashboard?referenceId=${referenceId}`
    : "http://localhost/api/mobile/dashboard";
  return GET(new NextRequest(url, { headers }));
}

test("401s with no Authorization header, before looking at referenceId", async () => {
  const res = await callRoute({}, UNKNOWN_REFERENCE_ID);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Unauthorized" });
});

test("401s with a wrong bearer token", async () => {
  const res = await callRoute({ authorization: "Bearer not-the-key" }, UNKNOWN_REFERENCE_ID);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Unauthorized" });
});

test("401s when the Authorization scheme isn't Bearer", async () => {
  const res = await callRoute({ authorization: KEY }, UNKNOWN_REFERENCE_ID);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Unauthorized" });
});

test("a correct bearer token gets past auth to the referenceId check", async () => {
  const missing = await callRoute({ authorization: `Bearer ${KEY}` }, null);
  assert.equal(missing.status, 400);

  const unknown = await callRoute({ authorization: `Bearer ${KEY}` }, UNKNOWN_REFERENCE_ID);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await unknown.json(), { error: "Unknown referenceId" });
});
