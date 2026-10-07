import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { chatMessages, getDb } from "../lib/db";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
import { GET, POST, DELETE } from "../app/api/chat/route";
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
afterEach(() => createMock.mockReset());

function postRequest(
  sessionAccountId: number,
  message: string,
  options: { role?: "coach" | "client"; accountId?: number; humanOnly?: boolean } = {},
) {
  const token = createSessionToken({ accountId: sessionAccountId, role: options.role ?? "client" });
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      message,
      ...(options.accountId != null ? { accountId: options.accountId } : {}),
      ...(options.humanOnly != null ? { humanOnly: options.humanOnly } : {}),
    }),
  });
}

function getRequest(
  sessionAccountId: number,
  options: { role?: "coach" | "client"; accountIdParam?: number } = {},
) {
  const token = createSessionToken({ accountId: sessionAccountId, role: options.role ?? "client" });
  const url =
    options.accountIdParam != null
      ? `http://localhost/api/chat?accountId=${options.accountIdParam}`
      : "http://localhost/api/chat";
  return new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

function deleteRequest(
  sessionAccountId: number,
  options: { role?: "coach" | "client"; accountIdParam?: number } = {},
) {
  const token = createSessionToken({ accountId: sessionAccountId, role: options.role ?? "client" });
  const url =
    options.accountIdParam != null
      ? `http://localhost/api/chat?accountId=${options.accountIdParam}`
      : "http://localhost/api/chat";
  return new NextRequest(url, { method: "DELETE", headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

test("POST /api/chat: a client's own message writes senderAccountId = accountId for both the user row and the assistant reply", async () => {
  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "an answer" }] });

  const { id: accountId } = await makeAccount("Chat Route Sender Test Client");
  const res = await POST(postRequest(accountId, "a question"));
  assert.equal(res.status, 200);

  const db = await getDb();
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.accountId, accountId));
  assert.equal(rows.length, 2, "expected the user message plus the assistant reply");
  for (const row of rows) {
    assert.equal(row.accountId, accountId);
    assert.equal(row.senderAccountId, accountId);
  }
});

test("POST /api/chat: a coach's message into a client's thread writes senderAccountId = coach id, accountId = client id, and still appends an assistant reply", async () => {
  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "an answer" }] });

  const { id: coachId } = await makeAccount("Chat Route Sender Test Coach", { role: "coach" });
  const { id: clientId } = await makeAccount("Chat Route Sender Test Coach Client");

  const res = await POST(postRequest(coachId, "what does the plan say about sodium", { role: "coach", accountId: clientId }));
  assert.equal(res.status, 200);

  const db = await getDb();
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.accountId, clientId))
    .orderBy(chatMessages.id);
  assert.equal(rows.length, 2, "expected the coach's message plus the assistant reply, both in the client's thread");

  const [userRow, assistantRow] = rows;
  assert.equal(userRow.accountId, clientId, "thread stays the client's");
  assert.equal(userRow.senderAccountId, coachId, "sender is whoever actually typed it");
  assert.equal(assistantRow.role, "assistant");
  assert.equal(assistantRow.accountId, clientId);
  assert.equal(
    assistantRow.senderAccountId,
    clientId,
    "the bot has no account, so an assistant row's senderAccountId is the thread's own accountId",
  );
});

test("POST /api/chat 403s a client sending an accountId that isn't their own", async () => {
  const { id: otherId } = await makeAccount("Chat Route Test POST Client Other");

  const res = await POST(postRequest(5, "hi", { role: "client", accountId: otherId }));
  assert.equal(res.status, 403);
});

test("GET /api/chat returns the correct senderName for both the client's own messages and a coach's messages in the same thread", async () => {
  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "answer one" }] });
  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "answer two" }] });

  const { id: coachId } = await makeAccount("Chat Route GET Sender Coach");
  const { id: clientId } = await makeAccount("Chat Route GET Sender Client");

  await POST(postRequest(clientId, "client question"));
  await POST(postRequest(coachId, "coach question", { role: "coach", accountId: clientId }));

  const res = await GET(getRequest(clientId));
  assert.equal(res.status, 200);
  const rows: { role: string; senderAccountId: number; senderName: string }[] = await res.json();
  assert.equal(rows.length, 4);

  const clientMsg = rows.find((r) => r.role === "user" && r.senderAccountId === clientId);
  const coachMsg = rows.find((r) => r.role === "user" && r.senderAccountId === coachId);
  assert.ok(clientMsg, "client's own message should be present");
  assert.ok(coachMsg, "coach's message should be present in the client's thread");
  assert.equal(clientMsg.senderName, "Chat Route GET Sender Client");
  assert.equal(coachMsg.senderName, "Chat Route GET Sender Coach");
});

test("GET /api/chat?accountId= lets a coach view a client's thread", async () => {
  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "an answer" }] });
  const { id: coachId } = await makeAccount("Chat Route GET Coach", { role: "coach" });
  const { id: clientId } = await makeAccount("Chat Route GET Coach Client");
  await POST(postRequest(clientId, "a question"));

  const res = await GET(getRequest(coachId, { role: "coach", accountIdParam: clientId }));
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.equal(rows.length, 2);
});

test("GET /api/chat?accountId= 403s a client requesting another account's id", async () => {
  const { id: otherId } = await makeAccount("Chat Route GET Client Other");

  const res = await GET(getRequest(5, { role: "client", accountIdParam: otherId }));
  assert.equal(res.status, 403);
});

test("DELETE /api/chat?accountId= clears the resolved thread, not necessarily the requester's own", async () => {
  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "an answer" }] });
  const { id: coachId } = await makeAccount("Chat Route DELETE Coach", { role: "coach" });
  const { id: clientId } = await makeAccount("Chat Route DELETE Coach Client");
  await POST(postRequest(clientId, "a question"));

  const res = await DELETE(deleteRequest(coachId, { role: "coach", accountIdParam: clientId }));
  assert.equal(res.status, 200);

  const db = await getDb();
  const remaining = await db.select().from(chatMessages).where(eq(chatMessages.accountId, clientId));
  assert.equal(remaining.length, 0, "the client's thread should be cleared");
});

test("POST /api/chat humanOnly:true from a client stores a human-only row, skips the bot, and returns no assistant", async () => {
  const { id: clientId } = await makeAccount("Chat Human Only Client");

  const res = await POST(postRequest(clientId, "hi coach", { humanOnly: true }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.user.humanOnly, true);
  assert.equal("assistant" in json, false, "a human-only send must not return an assistant key");
  assert.equal(createMock.mock.calls.length, 0, "the bot must not be called for a human-only message");

  const db = await getDb();
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.accountId, clientId));
  assert.equal(rows.length, 1, "no assistant reply row");
  assert.equal(rows[0].humanOnly, true);
  assert.equal(rows[0].senderAccountId, clientId);
});

test("POST /api/chat humanOnly:true from a coach into a client's thread keeps coach sender / client thread and skips the bot", async () => {
  const { id: coachId } = await makeAccount("Chat Human Only Coach", { role: "coach" });
  const { id: clientId } = await makeAccount("Chat Human Only Coach Client");

  const res = await POST(postRequest(coachId, "call me tomorrow", { role: "coach", accountId: clientId, humanOnly: true }));
  assert.equal(res.status, 200);
  assert.equal(createMock.mock.calls.length, 0);

  const db = await getDb();
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.accountId, clientId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].accountId, clientId);
  assert.equal(rows[0].senderAccountId, coachId);
  assert.equal(rows[0].humanOnly, true);
});

test("POST /api/chat with humanOnly omitted or false still replies via the bot and stores human_only = false on both rows", async () => {
  const { id: clientId } = await makeAccount("Chat Human Only Default Client");
  createMock.mockResolvedValue({ content: [{ type: "text", text: "an answer" }] });

  for (const humanOnly of [undefined, false]) {
    const res = await POST(postRequest(clientId, "a question", humanOnly === undefined ? {} : { humanOnly }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.assistant, "bot reply expected");
  }
  assert.equal(createMock.mock.calls.length, 2);

  const db = await getDb();
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.accountId, clientId));
  assert.equal(rows.length, 4);
  for (const row of rows) assert.equal(row.humanOnly, false);
});

test("POST /api/chat rejects a non-boolean humanOnly with 422", async () => {
  const { id: clientId } = await makeAccount("Chat Human Only Invalid Client");
  const token = createSessionToken({ accountId: clientId, role: "client" });
  const res = await POST(
    new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", humanOnly: "yes" }),
    }),
  );
  assert.equal(res.status, 422);
  assert.equal(createMock.mock.calls.length, 0);
});

test("POST /api/chat never sends human-only messages to the model, and the 8-message window is built from bot-relevant rows only", async () => {
  const { id: coachId } = await makeAccount("Chat Human Only History Coach", { role: "coach" });
  const { id: clientId } = await makeAccount("Chat Human Only History Client");
  const db = await getDb();

  // 8 bot-relevant rows (4 Q/A pairs), then 5 *newer* human-only rows. If
  // filtering happened after the -8 window, the window would be mostly
  // human-only rows and the bot context would be lost.
  for (let i = 1; i <= 4; i++) {
    await db.insert(chatMessages).values({ accountId: clientId, senderAccountId: clientId, role: "user", content: `bot question ${i}` });
    await db.insert(chatMessages).values({ accountId: clientId, senderAccountId: clientId, role: "assistant", content: `bot answer ${i}` });
  }
  for (let i = 1; i <= 5; i++) {
    await db.insert(chatMessages).values({
      accountId: clientId,
      senderAccountId: coachId,
      role: "user",
      content: `SECRET human-only note ${i}`,
      humanOnly: true,
    });
  }

  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "an answer" }] });
  const res = await POST(postRequest(clientId, "a fresh question"));
  assert.equal(res.status, 200);

  assert.equal(createMock.mock.calls.length, 1);
  const messages: { role: string; content: string }[] = createMock.mock.calls[0][0].messages;
  assert.ok(
    !JSON.stringify(createMock.mock.calls[0][0]).includes("SECRET human-only"),
    "no human-only text may reach the model, in history or anywhere else in the request",
  );
  const history = messages.slice(0, -1);
  assert.equal(history.length, 8, "all 8 bot-relevant rows fit the window");
  assert.deepEqual(
    history.map((m) => m.content),
    ["bot question 1", "bot answer 1", "bot question 2", "bot answer 2", "bot question 3", "bot answer 3", "bot question 4", "bot answer 4"],
  );
});

test("GET /api/chat returns humanOnly for both kinds of row", async () => {
  const { id: clientId } = await makeAccount("Chat Human Only GET Client");
  createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "an answer" }] });
  await POST(postRequest(clientId, "bot question"));
  await POST(postRequest(clientId, "human note", { humanOnly: true }));

  const res = await GET(getRequest(clientId));
  const rows: { content: string; humanOnly: boolean }[] = await res.json();
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.content === "human note")?.humanOnly, true);
  assert.equal(rows.find((r) => r.content === "bot question")?.humanOnly, false);
  assert.equal(rows.find((r) => r.content === "an answer")?.humanOnly, false);
});
