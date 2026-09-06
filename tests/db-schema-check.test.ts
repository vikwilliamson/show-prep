import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, test } from "vitest";
import { assertSchemaUpToDate } from "../lib/db/schema-check";

// assertSchemaUpToDate is exercised against real PGlite instances rather
// than mocks — it's a thin wrapper around one raw SQL query, and the thing
// actually worth verifying is that it agrees with what drizzle-orm's own
// migrate() really writes to "drizzle"."__drizzle_migrations". A mock of
// that table's shape would just re-assert our own assumption about it.

const REAL_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
const SINGLE_MIGRATION_FOLDER = path.join(
  process.cwd(),
  "tests/fixtures/drizzle-single",
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

test("resolves when the DB's latest applied migration matches the latest local migration file", async () => {
  const db = await freshPglite();
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db, { migrationsFolder: REAL_MIGRATIONS_FOLDER });

  await assert.doesNotReject(
    assertSchemaUpToDate(db, REAL_MIGRATIONS_FOLDER),
  );
});

test("throws a clear error when no migrations have ever been applied", async () => {
  const db = await freshPglite();

  await assert.rejects(
    assertSchemaUpToDate(db, REAL_MIGRATIONS_FOLDER),
    /out of sync|db:migrate/i,
  );
});

test("throws when the DB is behind the latest local migration file", async () => {
  const db = await freshPglite();
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  // Migrate against a fixture with exactly one migration, then check
  // against the real (much further ahead) migrations folder — simulates a
  // database that's behind what this build expects.
  await migrate(db, { migrationsFolder: SINGLE_MIGRATION_FOLDER });

  await assert.rejects(
    assertSchemaUpToDate(db, REAL_MIGRATIONS_FOLDER),
    /out of sync|db:migrate/i,
  );
});
