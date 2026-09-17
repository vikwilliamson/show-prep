import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { accounts, documents, getDb, protocols } from "../lib/db";
import { createSessionToken, deleteAccount, hashPasscode, SESSION_COOKIE } from "../lib/auth";
import { createAccountTracker } from "./helpers";

// Both routes call extractPrescriptions() (Claude) and indexDocument()
// (Voyage embeddings) — stub the two external-API seams so these tests
// exercise the real insert/replace logic in lib/protocols.ts without a
// network call.
const { extractMock } = vi.hoisted(() => ({ extractMock: vi.fn() }));
vi.mock("../lib/ai/extract", () => ({ extractPrescriptions: extractMock }));
vi.mock("../lib/ai/embeddings", () => ({
  embed: vi.fn(async (texts: string[]) => texts.map(() => new Array(1024).fill(0))),
}));

const { GET, POST } = await import("../app/api/documents/route");
const { POST: reprocess } = await import("../app/api/documents/[id]/reprocess/route");

const { makeAccount, cleanup } = createAccountTracker();
afterEach(() => {
  extractMock.mockReset();
  return cleanup();
});

function onePrescription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    has_prescription: true,
    summary: "Cut phase.",
    prescriptions: [
      {
        effective_date: null,
        calories: 1800,
        protein_g: 180,
        carbs_g: 150,
        fat_g: 50,
        cardio_plan: null,
        notes: null,
        source_quote: null,
        confidence: "high",
        ...overrides,
      },
    ],
  };
}

function jsonRequest(
  accountId: number,
  body: unknown,
  options: { role?: "coach" | "client" } = {},
) {
  const token = createSessionToken({ accountId, role: options.role ?? "client" });
  return new NextRequest("http://localhost/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
    body: JSON.stringify(body),
  });
}

function getRequest(accountId: number, options: { role?: "coach" | "client"; accountIdParam?: number } = {}) {
  const token = createSessionToken({ accountId, role: options.role ?? "client" });
  const url =
    options.accountIdParam != null
      ? `http://localhost/api/documents?accountId=${options.accountIdParam}`
      : "http://localhost/api/documents";
  return new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

test("POST /api/documents tags extracted protocols with the uploading account's accountId", async () => {
  const account = await makeAccount("Documents Route Test Upload");
  extractMock.mockResolvedValueOnce(onePrescription());

  const res = await POST(
    jsonRequest(account.id, { title: "Coach note", category: "coach_protocol", text: "1800 kcal" }),
  );
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.protocols.length, 1);
  assert.equal(json.protocols[0].accountId, account.id);

  const db = await getDb();
  const [row] = await db.select().from(protocols).where(eq(protocols.documentId, json.document.id));
  assert.equal(row.accountId, account.id);
  assert.equal(row.status, "pending");
});

test("POST /api/documents/[id]/reprocess replaces prior pending protocols and re-tags with accountId", async () => {
  const account = await makeAccount("Documents Route Test Reprocess");
  const db = await getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      accountId: account.id,
      title: "Coach note",
      category: "coach_protocol",
      sourceType: "email_paste",
      contentText: "1800 kcal",
    })
    .returning();
  const [stalePending] = await db
    .insert(protocols)
    .values({ accountId: account.id, documentId: doc.id, status: "pending", effectiveFrom: "2026-01-01" })
    .returning();

  extractMock.mockResolvedValueOnce(onePrescription({ calories: 2000 }));
  const res = await reprocess(
    new NextRequest("http://localhost/api/documents/1/reprocess", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${createSessionToken({ accountId: account.id, role: "client" })}` },
    }),
    { params: Promise.resolve({ id: String(doc.id) }) },
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.protocols.length, 1);
  assert.equal(json.protocols[0].accountId, account.id);
  assert.equal(json.protocols[0].calories, 2000);

  const remaining = await db.select().from(protocols).where(eq(protocols.documentId, doc.id));
  assert.equal(remaining.length, 1, "the stale pending protocol should have been replaced, not accumulated");
  assert.notEqual(remaining[0].id, stalePending.id);
});

test("GET /api/documents defaults to the caller's own account with no accountId param", async () => {
  const account = await makeAccount("Documents Route Test GET Default");
  const db = await getDb();
  await db.insert(documents).values({
    accountId: account.id,
    title: "own doc",
    category: "other",
    sourceType: "txt",
    contentText: "c",
  });

  const res = await GET(getRequest(account.id));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.length, 1);
  assert.equal(json[0].title, "own doc");
});

test("GET /api/documents?accountId= lets a coach view a client's library", async () => {
  const { id: clientId } = await makeAccount("Documents Route Test GET Coach Client");
  const db = await getDb();
  await db.insert(documents).values({
    accountId: clientId,
    title: "client doc",
    category: "other",
    sourceType: "txt",
    contentText: "c",
  });

  const res = await GET(getRequest(999, { role: "coach", accountIdParam: clientId }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.length, 1);
  assert.equal(json[0].title, "client doc");
});

test("GET /api/documents?accountId= 403s a client requesting another account's id", async () => {
  const { id: otherId } = await makeAccount("Documents Route Test GET Client Other");

  const res = await GET(getRequest(5, { role: "client", accountIdParam: otherId }));
  assert.equal(res.status, 403);
});

test("POST /api/documents accountId form field lets a coach upload into a client's library", async () => {
  const { id: clientId } = await makeAccount("Documents Route Test POST Coach Client");
  extractMock.mockResolvedValueOnce({ has_prescription: false, summary: "", prescriptions: [] });

  const res = await POST(
    jsonRequest(
      999,
      { title: "coach upload", category: "other", text: "some text", accountId: clientId },
      { role: "coach" },
    ),
  );
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.document.accountId, clientId);
});

test("POST /api/documents 403s a client sending an accountId that isn't their own", async () => {
  const { id: otherId } = await makeAccount("Documents Route Test POST Client Other");

  const res = await POST(
    jsonRequest(5, { title: "t", category: "other", text: "text", accountId: otherId }, { role: "client" }),
  );
  assert.equal(res.status, 403);
});

test("reprocess authorizes via the document's own row ownership, not the requester's accountId", async () => {
  const { id: clientId } = await makeAccount("Documents Route Test Reprocess Coach Client");
  const db = await getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      accountId: clientId,
      title: "client's coach note",
      category: "coach_protocol",
      sourceType: "email_paste",
      contentText: "1800 kcal",
    })
    .returning();

  extractMock.mockResolvedValueOnce(onePrescription({ calories: 1800 }));
  const res = await reprocess(
    new NextRequest("http://localhost/api/documents/1/reprocess", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${createSessionToken({ accountId: 999, role: "coach" })}` },
    }),
    { params: Promise.resolve({ id: String(doc.id) }) },
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(
    json.protocols[0].accountId,
    clientId,
    "extracted protocols must be tagged with the document's own account, not the coach's",
  );
});

test("reprocess 404s a coach poking at a document that isn't any client's", async () => {
  const db = await getDb();
  const passcodeHash = await hashPasscode("documents-reprocess-other-coach");
  const [otherCoach] = await db
    .insert(accounts)
    .values({ name: "Documents Route Test Reprocess Other Coach", role: "coach", passcodeHash })
    .returning();
  const [doc] = await db
    .insert(documents)
    .values({
      accountId: otherCoach.id,
      title: "other coach's note",
      category: "coach_protocol",
      sourceType: "email_paste",
      contentText: "1800 kcal",
    })
    .returning();

  try {
    const res = await reprocess(
      new NextRequest("http://localhost/api/documents/1/reprocess", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${createSessionToken({ accountId: 999, role: "coach" })}` },
      }),
      { params: Promise.resolve({ id: String(doc.id) }) },
    );
    assert.equal(res.status, 404);
  } finally {
    await deleteAccount(otherCoach.id);
  }
});
