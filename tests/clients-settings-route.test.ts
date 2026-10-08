import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
import { getSettings, getTargets } from "../lib/stats";
import { GET, PUT } from "../app/api/clients/[accountId]/settings/route";
import { createAccountTracker } from "./helpers";

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

function request(method: "GET" | "PUT", role: "coach" | "client" | null, body?: unknown) {
  const headers: Record<string, string> = {};
  if (role) {
    const token = createSessionToken({ accountId: 1, role });
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  if (body) headers["Content-Type"] = "application/json";
  return new NextRequest("http://localhost/api/clients/1/settings", {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function ctxFor(accountId: number) {
  return { params: Promise.resolve({ accountId: String(accountId) }) };
}

test("GET /api/clients/[accountId]/settings 401s with no session", async () => {
  const res = await GET(request("GET", null), ctxFor(1));
  assert.equal(res.status, 401);
});

test("GET /api/clients/[accountId]/settings 403s a client session", async () => {
  const res = await GET(request("GET", "client"), ctxFor(1));
  assert.equal(res.status, 403);
});

test("GET /api/clients/[accountId]/settings returns the target client's settings and targets", async () => {
  const { id } = await makeAccount("Client Settings Route Get");
  const res = await GET(request("GET", "coach"), ctxFor(id));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.settings.accountId, id);
  assert.equal(json.targets.accountId, id);
});

test("GET /api/clients/[accountId]/settings 404s for a nonexistent account", async () => {
  const res = await GET(request("GET", "coach"), ctxFor(999999));
  assert.equal(res.status, 404);
});

test("GET /api/clients/[accountId]/settings 404s for a coach account (not a client)", async () => {
  const { id } = await makeAccount("Client Settings Route Coach", { role: "coach" });
  const res = await GET(request("GET", "coach"), ctxFor(id));
  assert.equal(res.status, 404);
});

test("PUT /api/clients/[accountId]/settings 403s a client session", async () => {
  const { id } = await makeAccount("Client Settings Route Put Forbidden");
  const res = await PUT(request("PUT", "client", { settings: { targetName: "x" } }), ctxFor(id));
  assert.equal(res.status, 403);
  assert.equal((await getSettings(id)).targetName, null);
});

test("PUT /api/clients/[accountId]/settings updates the client's target date, weight, and nutrition targets", async () => {
  const { id } = await makeAccount("Client Settings Route Put");
  const res = await PUT(
    request("PUT", "coach", {
      settings: {
        targetDate: "2027-03-01",
        targetWeightLbs: 165.5,
        targetCalories: 2100,
        targetProteinG: 180,
        targetCarbsG: 210,
        targetFatG: 60,
      },
      targets: { waterMlMin: 3500 },
    }),
    ctxFor(id),
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.settings.targetDate, "2027-03-01");
  assert.equal(json.targets.waterMlMin, 3500);

  const s = await getSettings(id);
  assert.equal(s.targetDate, "2027-03-01");
  assert.equal(s.targetWeightLbs, 165.5);
  assert.equal(s.targetCalories, 2100);
  assert.equal((await getTargets(id)).waterMlMin, 3500);
});

test("PUT /api/clients/[accountId]/settings only touches the addressed client, not another", async () => {
  const { id: a } = await makeAccount("Client Settings Route Put A");
  const { id: b } = await makeAccount("Client Settings Route Put B");
  await PUT(request("PUT", "coach", { settings: { targetCalories: 1900 } }), ctxFor(a));
  assert.equal((await getSettings(a)).targetCalories, 1900);
  assert.equal((await getSettings(b)).targetCalories, null);
});

test("PUT /api/clients/[accountId]/settings 404s for a coach account (not a client)", async () => {
  const { id } = await makeAccount("Client Settings Route Put Coach", { role: "coach" });
  const res = await PUT(request("PUT", "coach", { settings: { targetName: "x" } }), ctxFor(id));
  assert.equal(res.status, 404);
});

test("PUT /api/clients/[accountId]/settings 422s on an invalid body", async () => {
  const { id } = await makeAccount("Client Settings Route Put Invalid");
  const res = await PUT(
    request("PUT", "coach", { settings: { targetCalories: -5 } }),
    ctxFor(id),
  );
  assert.equal(res.status, 422);
});
