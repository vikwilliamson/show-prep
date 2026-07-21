import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText } from "../lib/rag";

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
