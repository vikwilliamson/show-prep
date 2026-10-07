import assert from "node:assert/strict";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, test } from "vitest";
import { chatMessages, getDb } from "../lib/db";
import { createAccountTracker } from "./helpers";

// Exercises the real migration chain on top of data that predates the
// human_only column (see tests/db-schema-chat-sender-account-id-migration.test.ts
// for the same pattern): a fresh PGlite can't reproduce pre-existing rows.

const REAL_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
const PRE_MIGRATION_FOLDER = path.join(process.cwd(), "tests/fixtures/drizzle-pre-human-only");

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((fn) => fn()));
});

async function freshPglite() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../lib/db/schema");
  const client = new PGlite("memory://", { extensions: { vector } });
  cleanups.push(() => client.close());
  const db = drizzle(client, { schema });
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  return db;
}

test("the human_only migration defaults pre-existing chat rows to false", async () => {
  const db = await freshPglite();
  const { sql } = await import("drizzle-orm");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  await migrate(db, { migrationsFolder: PRE_MIGRATION_FOLDER });

  const accountResult = await db.execute<{ id: number }>(
    sql`INSERT INTO accounts (name, role, passcode_hash) VALUES ('Pre-Human-Only Account', 'client', 'hash') RETURNING id`,
  );
  const accountId = accountResult.rows[0].id;
  await db.execute(
    sql`INSERT INTO chat_messages (account_id, sender_account_id, role, content) VALUES (${accountId}, ${accountId}, 'user', 'a pre-existing question')`,
  );
  await db.execute(
    sql`INSERT INTO chat_messages (account_id, sender_account_id, role, content) VALUES (${accountId}, ${accountId}, 'assistant', 'a pre-existing answer')`,
  );

  await migrate(db, { migrationsFolder: REAL_MIGRATIONS_FOLDER });

  const rows = await db.select().from(chatMessages).where(eq(chatMessages.accountId, accountId));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.humanOnly, false, `${row.role} row should read back human_only = false`);
  }
});

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

test("chat_messages.human_only defaults to false when omitted on insert", async () => {
  const db = await getDb();
  const { id } = await makeAccount("Human Only Default Test");
  const [row] = await db
    .insert(chatMessages)
    .values({ accountId: id, senderAccountId: id, role: "user", content: "hi" })
    .returning();
  assert.equal(row.humanOnly, false);
});

test("chat_messages.human_only can be stored as true", async () => {
  const db = await getDb();
  const { id } = await makeAccount("Human Only True Test");
  const [row] = await db
    .insert(chatMessages)
    .values({ accountId: id, senderAccountId: id, role: "user", content: "hi", humanOnly: true })
    .returning();
  assert.equal(row.humanOnly, true);
});
