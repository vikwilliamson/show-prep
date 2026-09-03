import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { coachBriefs, getDb } from "../lib/db";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
import { createAccountTracker } from "./helpers";

// The route calls generateCoachBrief() (real Anthropic call) — mock it so
// these tests exercise auth/scoping/upsert logic, not AI generation
// (already covered separately in tests/brief.test.ts).
const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));
vi.mock("../lib/ai/brief", () => ({ generateCoachBrief: generateMock }));

const { GET, POST, PUT } = await import("../app/api/clients/[accountId]/brief/route");

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

const WEEK_START = "2026-02-02";

function requestWithSession(
  method: "GET" | "POST" | "PUT",
  accountId: number,
  role: "coach" | "client" | null,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (role) {
    headers.cookie = `${SESSION_COOKIE}=${createSessionToken({ accountId: 1, role })}`;
  }
  const url =
    method === "GET"
      ? `http://localhost/api/clients/${accountId}/brief?weekStart=${WEEK_START}`
      : `http://localhost/api/clients/${accountId}/brief`;
  return new NextRequest(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function ctxFor(accountId: number) {
  return { params: Promise.resolve({ accountId: String(accountId) }) };
}

test("401s with no session", async () => {
  const res = await GET(requestWithSession("GET", 1, null), ctxFor(1));
  assert.equal(res.status, 401);
});

test("403s a client session", async () => {
  const res = await GET(requestWithSession("GET", 1, "client"), ctxFor(1));
  assert.equal(res.status, 403);
});

test("404s a non-client accountId", async () => {
  const res = await GET(requestWithSession("GET", 999999, "coach"), ctxFor(999999));
  assert.equal(res.status, 404);
});

test("POST generates a draft brief; a second POST upserts in place, not duplicating", async () => {
  const { id: clientId } = await makeAccount("Brief Route Test Client A");
  generateMock.mockResolvedValue("first draft");

  const res1 = await POST(requestWithSession("POST", clientId, "coach", { weekStart: WEEK_START }), ctxFor(clientId));
  assert.equal(res1.status, 200);
  const json1 = await res1.json();
  assert.equal(json1.status, "draft");
  assert.equal(json1.content, "first draft");

  generateMock.mockResolvedValue("second draft");
  const res2 = await POST(requestWithSession("POST", clientId, "coach", { weekStart: WEEK_START }), ctxFor(clientId));
  assert.equal(res2.status, 200);

  const db = await getDb();
  const rows = await db.select().from(coachBriefs).where(eq(coachBriefs.accountId, clientId));
  assert.equal(rows.length, 1, "regenerating should not create a second row");
  assert.equal(rows[0].content, "second draft");
});

test("PUT with approve:true sets status to approved and stamps approvedAt", async () => {
  const { id: clientId } = await makeAccount("Brief Route Test Client B");
  generateMock.mockResolvedValue("draft content");
  await POST(requestWithSession("POST", clientId, "coach", { weekStart: WEEK_START }), ctxFor(clientId));

  const res = await PUT(
    requestWithSession("PUT", clientId, "coach", { weekStart: WEEK_START, content: "edited + approved", approve: true }),
    ctxFor(clientId),
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, "approved");
  assert.equal(json.content, "edited + approved");
  assert.ok(json.approvedAt);
});

test("PUT without approve edits content only, leaving approval state untouched", async () => {
  const { id: clientId } = await makeAccount("Brief Route Test Client C");
  generateMock.mockResolvedValue("draft content");
  await POST(requestWithSession("POST", clientId, "coach", { weekStart: WEEK_START }), ctxFor(clientId));
  await PUT(
    requestWithSession("PUT", clientId, "coach", { weekStart: WEEK_START, content: "approved content", approve: true }),
    ctxFor(clientId),
  );

  const res = await PUT(
    requestWithSession("PUT", clientId, "coach", { weekStart: WEEK_START, content: "typo fix" }),
    ctxFor(clientId),
  );
  const json = await res.json();
  assert.equal(json.status, "approved", "editing post-approval shouldn't unapprove it");
  assert.equal(json.content, "typo fix");
});

test("regenerating an approved brief resets it to draft and clears approvedAt", async () => {
  const { id: clientId } = await makeAccount("Brief Route Test Client D");
  generateMock.mockResolvedValue("draft content");
  await POST(requestWithSession("POST", clientId, "coach", { weekStart: WEEK_START }), ctxFor(clientId));
  await PUT(
    requestWithSession("PUT", clientId, "coach", { weekStart: WEEK_START, content: "approved content", approve: true }),
    ctxFor(clientId),
  );

  generateMock.mockResolvedValue("fresh draft after regenerate");
  const res = await POST(requestWithSession("POST", clientId, "coach", { weekStart: WEEK_START }), ctxFor(clientId));
  const json = await res.json();
  assert.equal(json.status, "draft", "a freshly regenerated draft was never re-approved");
  assert.equal(json.approvedAt, null);
  assert.equal(json.content, "fresh draft after regenerate");
});

test("GET returns null when no brief exists yet for the week", async () => {
  const { id: clientId } = await makeAccount("Brief Route Test Client E");
  const res = await GET(requestWithSession("GET", clientId, "coach"), ctxFor(clientId));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.brief, null);
});
