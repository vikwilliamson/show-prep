// Testable core of `pnpm db:reset-staging` (scripts/reset-staging.ts is the
// thin CLI wrapper that supplies the real neonctl/postgres/pnpm calls below
// as injected deps). Staging must never be reset via a parent-reset from
// production (see VIK-83 / specs — it's a demo branch and must never carry
// real health data) — this always wipes to an empty schema and rebuilds via
// migrate + seed, the same way VIK-76 recovered production.
//
// Migration is an explicit step here (runMigrations), not something that
// happens implicitly via getDb()'s cold-start path — see VIK-88. Since
// lib/db/index.ts no longer migrates Postgres on connect, seeding a wiped
// schema without this call would just hit assertSchemaUpToDate's fail-closed
// error.

/** Minimal surface of a `postgres` client this module actually needs. */
export interface SchemaClient {
  unsafe(sql: string): Promise<unknown>;
  end(): Promise<void>;
}

export interface ResetStagingDeps {
  /** Fetches the staging branch's connection string (e.g. via neonctl). */
  getConnectionString: () => string;
  /** Opens a client against the given connection string. */
  connectSql: (databaseUrl: string) => SchemaClient;
  /** Applies drizzle migrations against the given connection string. */
  runMigrations: (databaseUrl: string) => Promise<void>;
  /** Runs the seed script with the given environment. */
  runSeed: (env: NodeJS.ProcessEnv) => void;
}

/** Env for the seed subprocess: staging's DATABASE_URL, AI content on, everything else passed through unchanged. */
export function buildSeedEnv(
  baseEnv: NodeJS.ProcessEnv,
  databaseUrl: string,
): NodeJS.ProcessEnv {
  return { ...baseEnv, DATABASE_URL: databaseUrl, SEED_AI: "1" };
}

export async function resetStaging(deps: ResetStagingDeps): Promise<void> {
  const databaseUrl = deps.getConnectionString();
  const sql = deps.connectSql(databaseUrl);
  try {
    await sql.unsafe("DROP SCHEMA public CASCADE");
    await sql.unsafe("CREATE SCHEMA public");
  } finally {
    await sql.end();
  }
  // Only reached once the wipe has fully succeeded. Migrate explicitly
  // before seeding — the wiped schema has no tables until this runs.
  await deps.runMigrations(databaseUrl);
  deps.runSeed(buildSeedEnv(process.env, databaseUrl));
}
