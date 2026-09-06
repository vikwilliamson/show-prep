import { sql } from "drizzle-orm";
import path from "node:path";
import { env } from "../env";
import * as schema from "./schema";
import { assertSchemaUpToDate } from "./schema-check";

// Two drivers behind one interface:
//  - DATABASE_URL set  -> real Postgres via postgres-js (needs pgvector installed)
//  - otherwise         -> embedded PGlite (WASM Postgres) with the vector extension,
//                         persisted under .data/pglite. Zero-config dev.
//
// Migrations are NOT applied here for the Postgres path (see VIK-88 /
// AGENTS.md's "Migrations" section) — concurrent serverless cold starts
// racing to migrate the same production database is exactly the mechanism
// that caused VIK-76. Migrations for Postgres now run as an explicit
// deploy step (`pnpm db:migrate`, see lib/db/migrate.ts and vercel.json);
// this module only fails closed via assertSchemaUpToDate() if that step
// was skipped. The embedded PGlite path is unaffected — it's a
// single-process, zero-config dev database, not a shared server, so it
// keeps migrating on every boot.

import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type Db =
  | PgliteDatabase<typeof schema>
  | PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __gammaDb?: Promise<Db> };

async function initDb(): Promise<Db> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  let db: Db;

  if (!env.databaseUrl && process.env.VERCEL) {
    // Serverless filesystems are ephemeral — the PGlite fallback would lose
    // data on every cold start. Refuse to boot without a real database.
    throw new Error(
      "DATABASE_URL must be set in production (e.g. a Neon/Vercel Postgres URL with pgvector).",
    );
  }

  if (env.databaseUrl) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    // prepare:false keeps postgres-js compatible with transaction-mode
    // poolers (Neon -pooler URLs, PgBouncer).
    const client = postgres(env.databaseUrl, { max: 5, prepare: false });
    const pgDb = drizzle(client, { schema });
    await assertSchemaUpToDate(pgDb, migrationsFolder);
    db = pgDb;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { vector } = await import("@electric-sql/pglite-pgvector");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dataDir = path.join(process.cwd(), env.pgliteDir);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
    const client = new PGlite(dataDir, { extensions: { vector } });
    const liteDb = drizzle(client, { schema });
    await liteDb.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await migrate(liteDb, { migrationsFolder });
    db = liteDb;
  }

  return db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__gammaDb) {
    globalForDb.__gammaDb = initDb().catch((err) => {
      // Don't cache a failed init (e.g. transient PGlite lock during HMR).
      globalForDb.__gammaDb = undefined;
      throw err;
    });
  }
  return globalForDb.__gammaDb;
}

export * from "./schema";
