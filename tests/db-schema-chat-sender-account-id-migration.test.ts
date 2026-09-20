import assert from "node:assert/strict";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, test } from "vitest";
import { chatMessages, getDb } from "../lib/db";
import { createAccountTracker } from "./helpers";

// Exercises the real 0018 migration file (drizzle/0018_tired_annihilus.sql)
// against data that predates it, rather than trusting schema.ts's NOT NULL
// declaration alone — the embedded PGlite path used by every other test
// applies the full migration chain to a fresh, empty database on every
// boot, so it can never reproduce "rows that existed before sender_account_id
// did." See tests/db-schema-check.test.ts for the same fixture-folder
// pattern (migrate against a truncated folder, then compare to the real one).

const REAL_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
const PRE_MIGRATION_FOLDER = path.join(
  process.cwd(),
  "tests/fixtures/drizzle-pre-sender-account-id",
);

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

test("migration 0018 backfills sender_account_id = account_id for pre-existing rows", async () => {
  const db = await freshPglite();
  const { sql } = await import("drizzle-orm");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  // Pre-migration state: chat_messages has no sender_account_id column yet.
  await migrate(db, { migrationsFolder: PRE_MIGRATION_FOLDER });

  const accountResult = await db.execute<{ id: number }>(
    sql`INSERT INTO accounts (name, role, passcode_hash) VALUES ('Pre-Migration Account', 'client', 'hash') RETURNING id`,
  );
  const accountId = accountResult.rows[0].id;

  await db.execute(
    sql`INSERT INTO chat_messages (account_id, role, content) VALUES (${accountId}, 'user', 'a pre-existing question')`,
  );
  await db.execute(
    sql`INSERT INTO chat_messages (account_id, role, content) VALUES (${accountId}, 'assistant', 'a pre-existing answer')`,
  );

  // Apply the real migration chain, including 0018, on top of that state.
  await migrate(db, { migrationsFolder: REAL_MIGRATIONS_FOLDER });

  const rows = await db.select().from(chatMessages).where(eq(chatMessages.accountId, accountId));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(
      row.senderAccountId,
      accountId,
      `${row.role} row should have been backfilled with sender_account_id = account_id`,
    );
  }
});

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

test("chat_messages.sender_account_id is NOT NULL", async () => {
  const db = await getDb();
  const { id: a } = await makeAccount("Sender Account NotNull Test");

  await assert.rejects(() =>
    db.insert(chatMessages).values({ accountId: a, role: "user", content: "hi" } as never),
  );
});
