import { sql } from "drizzle-orm";
import path from "node:path";
import * as schema from "./schema";

const migrationsFolder = path.join(process.cwd(), "drizzle");

// The only place migrations are applied to a real Postgres database now
// (see VIK-88 / AGENTS.md's "Migrations" section) — lib/db/index.ts's
// runtime Postgres path only checks the schema is up to date, it never
// migrates. Used by scripts/migrate.ts (the `pnpm db:migrate` CLI that
// vercel.json's buildCommand runs on every deploy) and by
// lib/reset-staging.ts, which calls this directly after wiping the
// staging schema.
export async function runMigrations(databaseUrl: string): Promise<void> {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const postgres = (await import("postgres")).default;
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const db = drizzle(client, { schema });
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}
