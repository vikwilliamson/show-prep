import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { sql } from "drizzle-orm";
import { chunkText, retrieve } from "../lib/rag";
import { documentChunks, documents, getDb } from "../lib/db";
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
afterEach(cleanup);

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
