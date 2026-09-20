import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { chatMessages, getDb } from "../lib/db";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
import { POST } from "../app/api/chat/route";
import { createAccountTracker } from "./helpers";

// answerQuestion() calls client.messages.create() — mock at that seam, same
// approach as tests/rag.test.ts, so this test doesn't need a real API key.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../lib/ai/embeddings", () => ({
  embed: vi.fn(async (texts: string[]) => texts.map(() => new Array(1024).fill(0))),
}));

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

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

function postRequest(accountId: number, message: string) {
  const token = createSessionToken({ accountId, role: "client" });
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

test("POST /api/chat writes sender_account_id = account_id for a client's own message and the assistant reply", async () => {
  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "an answer" }] });

  const { id: accountId } = await makeAccount("Chat Route Sender Test");
  const res = await POST(postRequest(accountId, "a question"));
  assert.equal(res.status, 200);

  const db = await getDb();
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.accountId, accountId));
  assert.equal(rows.length, 2, "expected the user message plus the assistant reply");
  for (const row of rows) {
    assert.equal(
      row.senderAccountId,
      accountId,
      `${row.role} row should have senderAccountId === accountId (no coach/client split yet — that's VIK-151)`,
    );
  }
});
