import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { eq } from "drizzle-orm";
import { documents, getDb, protocols } from "../lib/db";
import type { ExtractionResultT } from "../lib/ai/extract";
import { saveExtractedProtocols } from "../lib/protocols";
import { createAccountTracker } from "./helpers";

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

async function makeDocument(accountId: number) {
  const db = await getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      accountId,
      title: "Coach note",
      category: "coach_protocol",
      sourceType: "email_paste",
      contentText: "1800 kcal, 180g protein",
    })
    .returning();
  return doc;
}

function extraction(overrides: Partial<ExtractionResultT> = {}): ExtractionResultT {
  return {
    has_prescription: true,
    summary: "Cut phase macros.",
    prescriptions: [
      {
        effective_date: null,
        calories: 1800.4,
        protein_g: 180.6,
        carbs_g: 150,
        fat_g: 50,
        cardio_plan: "3x20min LISS",
        notes: "Refeed on Sunday.",
        source_quote: "1800 kcal, 180g protein",
        confidence: "high",
      },
    ],
    ...overrides,
  };
}

test("no-ops when the extraction found no prescriptions", async () => {
  const account = await makeAccount("Protocols Helper No Prescriptions");
  const doc = await makeDocument(account.id);

  const created = await saveExtractedProtocols(
    extraction({ has_prescription: false, prescriptions: [] }),
    { documentId: doc.id, accountId: account.id, today: "2026-09-06" },
  );

  assert.deepEqual(created, []);
});

test("inserts one protocol per prescription, rounding macros and falling back to today's date", async () => {
  const account = await makeAccount("Protocols Helper Insert");
  const doc = await makeDocument(account.id);

  const created = await saveExtractedProtocols(extraction(), {
    documentId: doc.id,
    accountId: account.id,
    today: "2026-09-06",
  });

  assert.equal(created.length, 1);
  assert.equal(created[0].documentId, doc.id);
  assert.equal(created[0].accountId, account.id);
  assert.equal(created[0].status, "pending");
  assert.equal(created[0].effectiveFrom, "2026-09-06");
  assert.equal(created[0].calories, 1800);
  assert.equal(created[0].proteinG, 181);
  assert.equal(created[0].cardioPlan, "3x20min LISS");
  assert.equal((created[0].extractedJson as { summary: string }).summary, "Cut phase macros.");
});

test("replacePending deletes prior pending protocols for the document but leaves confirmed ones", async () => {
  const account = await makeAccount("Protocols Helper Replace");
  const doc = await makeDocument(account.id);
  const db = await getDb();
  const [pending, active] = await db
    .insert(protocols)
    .values([
      { accountId: account.id, documentId: doc.id, status: "pending", effectiveFrom: "2026-01-01" },
      { accountId: account.id, documentId: doc.id, status: "active", effectiveFrom: "2026-01-01" },
    ])
    .returning();

  await saveExtractedProtocols(extraction(), {
    documentId: doc.id,
    accountId: account.id,
    today: "2026-09-06",
    replacePending: true,
  });

  const remaining = await db
    .select()
    .from(protocols)
    .where(eq(protocols.documentId, doc.id));
  const ids = remaining.map((p) => p.id);
  assert.ok(!ids.includes(pending.id), "prior pending protocol should have been deleted");
  assert.ok(ids.includes(active.id), "confirmed protocol should be untouched");
  assert.equal(remaining.filter((p) => p.status === "pending").length, 1);
});

test("without replacePending, prior pending protocols are left alone", async () => {
  const account = await makeAccount("Protocols Helper No Replace");
  const doc = await makeDocument(account.id);
  const db = await getDb();
  const [pending] = await db
    .insert(protocols)
    .values([{ accountId: account.id, documentId: doc.id, status: "pending", effectiveFrom: "2026-01-01" }])
    .returning();

  await saveExtractedProtocols(extraction(), {
    documentId: doc.id,
    accountId: account.id,
    today: "2026-09-06",
  });

  const remaining = await db
    .select()
    .from(protocols)
    .where(eq(protocols.documentId, doc.id));
  assert.equal(remaining.filter((p) => p.status === "pending").length, 2);
  assert.ok(remaining.some((p) => p.id === pending.id));
});
