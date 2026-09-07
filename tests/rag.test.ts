import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { answerQuestion, chunkText, indexDocument, retrieve } from "../lib/rag";
import { documentChunks, documents, getDb } from "../lib/db";
import { embed } from "../lib/ai/embeddings";
import { createAccountTracker } from "./helpers";

// retrieve() embeds the query via Voyage; stub it so tests don't need a real
// API key or network access. Returns a fixed vector regardless of input.
vi.mock("../lib/ai/embeddings", () => ({
  embed: vi.fn(async (texts: string[]) =>
    texts.map(() => {
      const v = new Array(1024).fill(0);
      v[0] = 1;
      return v;
    }),
  ),
}));

// answerQuestion() calls client.messages.create() — mock at that seam, the
// same approach tests/brief.test.ts and tests/analysis.test.ts use, so this
// test doesn't need a real API key.
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

test("short text yields one chunk", () => {
  const chunks = chunkText("Calories: 2100\nProtein: 210g");
  assert.equal(chunks.length, 1);
});

test("long documents split near the target size", () => {
  const para = "Protein 210 grams every day, split across four meals. ".repeat(8);
  const text = Array.from({ length: 10 }, () => para).join("\n\n");
  const chunks = chunkText(text);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.length <= 1600, `chunk too long: ${c.length}`);
  }
});

test("no content is lost (every paragraph appears in some chunk)", () => {
  const paragraphs = Array.from(
    { length: 12 },
    (_, i) => `Unique paragraph marker ${i} with some macro details.`,
  );
  const chunks = chunkText(paragraphs.join("\n\n"));
  const joined = chunks.join("\n");
  for (const p of paragraphs) {
    assert.ok(joined.includes(p), `missing: ${p}`);
  }
});

test("oversized single paragraphs are hard-split", () => {
  const chunks = chunkText("x".repeat(5000));
  assert.ok(chunks.length >= 4);
});

test("empty text yields no chunks", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("\n\n  \n"), []);
});

const { makeAccount, cleanup } = createAccountTracker();
afterEach(() => {
  createMock.mockClear();
  return cleanup();
});

// The mocked query embedding is a one-hot vector at index 0. Chunks whose
// embedding matches it exactly are equally similar regardless of account —
// so if retrieve() ever dropped its accountId filter, this test would start
// returning account B's chunk for account A's query.
const MATCHING_VECTOR = (() => {
  const v = new Array(1024).fill(0);
  v[0] = 1;
  return v;
})();

test("retrieve() never returns another account's chunks", async () => {
  const db = await getDb();
  const accountA = await makeAccount("RAG Account A");
  const accountB = await makeAccount("RAG Account B");

  const [docA] = await db
    .insert(documents)
    .values({
      accountId: accountA.id,
      title: "Account A protocol",
      sourceType: "txt",
      contentText: "irrelevant",
    })
    .returning();
  const [docB] = await db
    .insert(documents)
    .values({
      accountId: accountB.id,
      title: "Account B protocol",
      sourceType: "txt",
      contentText: "irrelevant",
    })
    .returning();

  await db.insert(documentChunks).values([
    {
      accountId: accountA.id,
      documentId: docA.id,
      chunkIndex: 0,
      content: "Account A's macros",
      embedding: MATCHING_VECTOR,
    },
    {
      accountId: accountB.id,
      documentId: docB.id,
      chunkIndex: 0,
      content: "Account B's macros",
      embedding: MATCHING_VECTOR,
    },
  ]);

  const results = await retrieve(accountA.id, "what are my macros?");

  assert.ok(results.length > 0, "expected at least one match for account A");
  for (const r of results) {
    assert.equal(r.documentId, docA.id, "leaked a chunk from another account");
  }
});

test("answerQuestion returns the model's text and cites deduplicated sources", async () => {
  const db = await getDb();
  const account = await makeAccount("RAG Chat Account");
  const [doc] = await db
    .insert(documents)
    .values({
      accountId: account.id,
      title: "Coach protocol",
      sourceType: "txt",
      contentText: "irrelevant",
    })
    .returning();

  await db.insert(documentChunks).values([
    {
      accountId: account.id,
      documentId: doc.id,
      chunkIndex: 0,
      content: "2100 kcal per day.",
      embedding: MATCHING_VECTOR,
    },
    {
      accountId: account.id,
      documentId: doc.id,
      chunkIndex: 1,
      content: "210g protein per day.",
      embedding: MATCHING_VECTOR,
    },
  ]);

  createMock.mockResolvedValueOnce({
    content: [{ type: "text", text: "Your target is 2100 kcal and 210g protein." }],
  });

  const result = await answerQuestion(account.id, "What are my macros?", []);

  assert.equal(result.answer, "Your target is 2100 kcal and 210g protein.");
  assert.equal(result.sources.length, 1, "both matching chunks came from the same document");
  assert.equal(result.sources[0].documentId, doc.id);

  const params = createMock.mock.calls[0][0];
  assert.equal(params.max_tokens, 16000);
  const payload = JSON.stringify(params);
  assert.ok(payload.includes("2100 kcal per day."), "prompt should ground in the retrieved excerpt");
});

test("indexDocument leaves existing chunks and embeddedAt untouched when the insert fails partway", async () => {
  const db = await getDb();
  const account = await makeAccount("RAG Transactional Account");
  const [doc] = await db
    .insert(documents)
    .values({
      accountId: account.id,
      title: "Protocol",
      sourceType: "txt",
      contentText: "Calories: 2100\n\nProtein: 210g",
    })
    .returning();

  // Seed state from a prior successful index — this is what a failed
  // re-index must leave untouched.
  await db.insert(documentChunks).values({
    accountId: account.id,
    documentId: doc.id,
    chunkIndex: 0,
    content: "stale chunk from a prior index",
    embedding: MATCHING_VECTOR,
  });
  await db
    .update(documents)
    .set({ embeddedAt: new Date("2020-01-01") })
    .where(eq(documents.id, doc.id));

  // Force the insert step to fail: a wrong-dimension vector violates the
  // embedding column's pgvector dimension constraint mid-transaction.
  vi.mocked(embed).mockResolvedValueOnce([[1, 2, 3]]);

  await assert.rejects(() => indexDocument({ ...doc, contentText: "New content here" }));

  const chunksAfter = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, doc.id));
  assert.equal(chunksAfter.length, 1, "the pre-existing chunk should survive — delete must roll back");
  assert.equal(chunksAfter[0].content, "stale chunk from a prior index");

  const [docAfter] = await db.select().from(documents).where(eq(documents.id, doc.id));
  assert.equal(
    docAfter.embeddedAt?.toISOString().slice(0, 10),
    "2020-01-01",
    "embeddedAt should not have been touched by the failed attempt",
  );
});

test("document_chunks.embedding has an HNSW index for fast similarity search", async () => {
  const db = await getDb();
  const result = await db.execute(
    sql`select indexdef from pg_indexes where tablename = 'document_chunks'`,
  );
  // postgres-js's execute() returns the row array directly; PGlite's wraps
  // it in { rows }. Normalize since getDb() can return either driver.
  const rows = (Array.isArray(result) ? result : result.rows) as {
    indexdef: string;
  }[];
  const hasHnsw = rows.some((r) => r.indexdef.toLowerCase().includes("hnsw"));
  assert.ok(hasHnsw, `expected an HNSW index; found: ${JSON.stringify(rows)}`);
});
