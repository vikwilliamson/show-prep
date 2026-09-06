import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

type AnyDb = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

// db.execute()'s raw-query return shape differs by driver: postgres-js
// returns the row array directly, PGlite's returns { rows, fields,
// affectedRows }. Normalize rather than branching on which Db subtype this
// is.
function extractRows(result: unknown): { hash: string }[] {
  if (Array.isArray(result)) {
    return result as { hash: string }[];
  }
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: { hash: string }[] }).rows;
  }
  return [];
}

// Migrations now apply as an explicit deploy step (see lib/db/migrate.ts,
// AGENTS.md's "Migrations" section), not implicitly at boot — this is the
// fail-closed check that replaces implicit migration on the real-Postgres
// path in lib/db/index.ts. It never migrates anything itself; it only
// verifies that drizzle's own migrations tracking table
// ("drizzle"."__drizzle_migrations", the same table+schema migrate() writes
// to with its default options) already reflects the latest migration file
// this build ships.
export async function assertSchemaUpToDate(
  db: AnyDb,
  migrationsFolder: string,
): Promise<void> {
  const latestLocalHash = readMigrationFiles({ migrationsFolder }).at(-1)?.hash;

  let latestAppliedHash: string | undefined;
  try {
    const result = await db.execute(
      sql`select hash from "drizzle"."__drizzle_migrations" order by created_at desc limit 1`,
    );
    latestAppliedHash = extractRows(result)[0]?.hash;
  } catch {
    latestAppliedHash = undefined;
  }

  if (!latestLocalHash || latestAppliedHash !== latestLocalHash) {
    throw new Error(
      "Database schema is out of sync with this build's migrations (drizzle/). " +
        "Migrations run as an explicit deploy step now, not implicitly at boot " +
        "— run `pnpm db:migrate` against this database before starting the " +
        'app. See AGENTS.md\'s "Migrations" section.',
    );
  }
}
