import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { documents, getDb, protocols } from "../lib/db";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
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

const { POST } = await import("../app/api/documents/route");
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

function jsonRequest(accountId: number, body: unknown) {
  const token = createSessionToken({ accountId, role: "client" });
  return new NextRequest("http://localhost/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
    body: JSON.stringify(body),
  });
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
