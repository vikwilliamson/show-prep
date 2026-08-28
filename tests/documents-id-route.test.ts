import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { accounts, documents, getDb } from "../lib/db";
import { createSessionToken, hashPasscode, SESSION_COOKIE } from "../lib/auth";
import { DELETE, GET } from "../app/api/documents/[id]/route";

const createdAccountIds: number[] = [];

async function makeAccount(name: string): Promise<number> {
  const db = await getDb();
  const passcodeHash = await hashPasscode(`${name}-passcode`);
  const [row] = await db
    .insert(accounts)
    .values({ name, role: "client", passcodeHash })
    .returning();
  createdAccountIds.push(row.id);
  return row.id;
}

async function makeDocument(accountId: number, title: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(documents)
    .values({
      accountId,
      title,
      category: "other",
      sourceType: "txt",
      contentText: "content",
    })
    .returning();
  return row.id;
}

afterEach(async () => {
  const db = await getDb();
  if (createdAccountIds.length === 0) return;
  await db.delete(documents).where(inArray(documents.accountId, createdAccountIds));
  await db.delete(accounts).where(inArray(accounts.id, createdAccountIds));
  createdAccountIds.length = 0;
});

function requestWithSession(accountId: number | null) {
  const headers: Record<string, string> = {};
  if (accountId !== null) {
    const token = createSessionToken({ accountId, role: "client" });
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  return new NextRequest("http://localhost/api/documents/1", { headers });
}

function ctxFor(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

test("GET requires a session", async () => {
  const res = await GET(requestWithSession(null), ctxFor(1));
  assert.equal(res.status, 401);
});

test("GET returns the document for the owning account", async () => {
  const a = await makeAccount("Documents Route Test Owner");
  const docId = await makeDocument(a, "A's doc");

  const res = await GET(requestWithSession(a), ctxFor(docId));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.title, "A's doc");
});

test("GET returns 404 for another account's document", async () => {
  const a = await makeAccount("Documents Route Test A");
  const b = await makeAccount("Documents Route Test B");
  const docId = await makeDocument(a, "A's doc");

  const res = await GET(requestWithSession(b), ctxFor(docId));
  assert.equal(res.status, 404);
});

test("DELETE requires a session", async () => {
  const res = await DELETE(requestWithSession(null), ctxFor(1));
  assert.equal(res.status, 401);
});

test("DELETE removes the document for the owning account", async () => {
  const a = await makeAccount("Documents Route Test Delete Owner");
  const docId = await makeDocument(a, "to delete");

  const res = await DELETE(requestWithSession(a), ctxFor(docId));
  assert.equal(res.status, 200);

  const db = await getDb();
  const remaining = await db
    .select()
    .from(documents)
    .where(inArray(documents.id, [docId]));
  assert.equal(remaining.length, 0);
});

test("DELETE does not remove, and 404s on, another account's document", async () => {
  const a = await makeAccount("Documents Route Test Delete A");
  const b = await makeAccount("Documents Route Test Delete B");
  const docId = await makeDocument(a, "A's doc");

  const res = await DELETE(requestWithSession(b), ctxFor(docId));
  assert.equal(res.status, 404);

  const db = await getDb();
  const stillThere = await db
    .select()
    .from(documents)
    .where(inArray(documents.id, [docId]));
  assert.equal(stillThere.length, 1);
});
