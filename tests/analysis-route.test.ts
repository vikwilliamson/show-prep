import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { checkIns, getDb } from "../lib/db";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
import { createAccountTracker } from "./helpers";

// generateWeeklyAnalysis() calls client.messages.create() — mock at that
// seam, same approach tests/auth.test.ts and tests/brief.test.ts use, so
// this doesn't need a real API key.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../lib/ai/client", () => ({
  getAnthropic: () => ({ messages: { create: createMock } }),
  MODEL: "test-model",
  AI_MESSAGE_DEFAULTS: { max_tokens: 16000, thinking: { type: "adaptive" } },
  extractText: (response: { content: { type: string; text?: string }[] }) =>
    response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n"),
}));

const { POST } = await import("../app/api/analysis/route");

const { makeAccount, cleanup } = createAccountTracker();
afterEach(() => {
  createMock.mockClear();
  return cleanup();
});

const WEEK_START = "2026-02-02";

function requestWithSession(accountId: number) {
  const token = createSessionToken({ accountId, role: "client" });
  return new NextRequest("http://localhost/api/analysis", {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    body: JSON.stringify({ weekStart: WEEK_START }),
  });
}

test("analysis is saved against the requesting session's own account, not a shared fallback", async () => {
  const { id: a } = await makeAccount("Analysis Route Test A");
  const { id: b } = await makeAccount("Analysis Route Test B");

  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "A's analysis" }] });
  const resA = await POST(requestWithSession(a));
  assert.equal(resA.status, 200);

  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "B's analysis" }] });
  const resB = await POST(requestWithSession(b));
  assert.equal(resB.status, 200);

  const db = await getDb();
  const [rowA] = await db
    .select()
    .from(checkIns)
    .where(eq(checkIns.accountId, a));
  const [rowB] = await db
    .select()
    .from(checkIns)
    .where(eq(checkIns.accountId, b));

  assert.equal(rowA.aiAnalysis, "A's analysis");
  assert.equal(rowB.aiAnalysis, "B's analysis");
});

test("an unauthenticated request is rejected rather than falling back to a default account", async () => {
  const res = await POST(
    new NextRequest("http://localhost/api/analysis", {
      method: "POST",
      body: JSON.stringify({ weekStart: WEEK_START }),
    }),
  );
  assert.equal(res.status, 401);
});
