/**
 * One-command reset for the `staging` Neon branch: wipes it to an empty
 * schema, then lets the normal getDb() cold-start path re-migrate, and
 * finally reseeds with demo data.
 *
 * Run with: pnpm db:reset-staging
 *
 * Deliberately never resets from `test` or production — staging must never
 * carry real personal health data, even transiently. See VIK-83.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { resetStaging } from "../lib/reset-staging";

const NEON_PROJECT_ID = "aged-resonance-61061629";
const STAGING_BRANCH = "staging";

function getConnectionString(): string {
  return execFileSync(
    "neonctl",
    ["connection-string", STAGING_BRANCH, "--project-id", NEON_PROJECT_ID, "--pooled"],
    { encoding: "utf8" },
  ).trim();
}

function runSeed(env: NodeJS.ProcessEnv): void {
  execFileSync("pnpm", ["run", "seed"], { stdio: "inherit", env });
}

resetStaging({
  getConnectionString,
  connectSql: (databaseUrl) => postgres(databaseUrl, { max: 1, prepare: false }),
  runSeed,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
