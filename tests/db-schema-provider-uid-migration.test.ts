import assert from "node:assert/strict";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterEach, test } from "vitest";
import {
  dailyActivity,
  hydrationEntries,
  sleepSessions,
  weightEntries,
  workouts,
} from "../lib/db";

// drizzle-kit generated drop+add (data loss) for hydration_entries and
// sleep_sessions when renaming hc_uid -> provider_uid; the migration was
// rewritten by hand as pure RENAMEs. This applies the real migration chain on
// top of rows that predate it and asserts every one keeps its ID.

const REAL_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
const PRE_MIGRATION_FOLDER = path.join(process.cwd(), "tests/fixtures/drizzle-pre-human-only");

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((fn) => fn()));
});

test("migration 0020 renames hc_uid to provider_uid without losing existing IDs, and keeps the account-scoped unique index", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { sql } = await import("drizzle-orm");
  const schema = await import("../lib/db/schema");
  const client = new PGlite("memory://", { extensions: { vector } });
  cleanups.push(() => client.close());
  const db = drizzle(client, { schema });
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  await migrate(db, { migrationsFolder: PRE_MIGRATION_FOLDER });

  const acct = await db.execute<{ id: number }>(
    sql`INSERT INTO accounts (name, role, passcode_hash) VALUES ('Pre-Migration', 'client', 'h') RETURNING id`,
  );
  const id = acct.rows[0].id;
  await db.execute(sql`INSERT INTO weight_entries (account_id, hc_uid, measured_at, local_date, weight_lbs) VALUES (${id}, 'w-1', now(), '2026-01-01', 180)`);
  await db.execute(sql`INSERT INTO hydration_entries (account_id, hc_uid, local_date, volume_ml) VALUES (${id}, 'h-1', '2026-01-01', 500)`);
  await db.execute(sql`INSERT INTO sleep_sessions (account_id, hc_uid, local_date, started_at, ended_at, duration_min) VALUES (${id}, 's-1', '2026-01-01', now(), now(), 480)`);
  await db.execute(sql`INSERT INTO workouts (account_id, hc_uid, local_date, started_at) VALUES (${id}, 'x-1', '2026-01-01', now())`);
  await db.execute(sql`INSERT INTO daily_activity (account_id, hc_uid, local_date, steps) VALUES (${id}, 'a-1', '2026-01-01', 4000)`);

  await migrate(db, { migrationsFolder: REAL_MIGRATIONS_FOLDER });

  const one = async (table: typeof weightEntries | typeof hydrationEntries | typeof sleepSessions | typeof workouts | typeof dailyActivity, uid: string) =>
    (await db.select().from(table).where(and(eq(table.accountId, id), eq(table.providerUid, uid)))).length;
  assert.equal(await one(weightEntries, "w-1"), 1);
  assert.equal(await one(hydrationEntries, "h-1"), 1);
  assert.equal(await one(sleepSessions, "s-1"), 1);
  assert.equal(await one(workouts, "x-1"), 1);
  assert.equal(await one(dailyActivity, "a-1"), 1);

  // The renamed index is still the account-scoped unique constraint.
  await assert.rejects(() =>
    db.execute(sql`INSERT INTO weight_entries (account_id, provider_uid, measured_at, local_date, weight_lbs) VALUES (${id}, 'w-1', now(), '2026-01-02', 181)`),
  );
});
