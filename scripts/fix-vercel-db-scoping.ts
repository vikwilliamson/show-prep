/**
 * One-command recovery if the Neon<->Vercel integration ever re-syncs a
 * shared DATABASE_URL across Production/Preview/Development again (e.g.
 * after a disconnect/reconnect of the integration, or a stray `vercel env
 * rm` on a shared var — both have happened once already, see VIK-83).
 *
 * Restores Production -> the real production Neon branch, Development ->
 * the `test` branch. Preview is intentionally left alone: the Neon
 * integration is connected scoped to Preview only and manages that one
 * itself (per-deployment branch injection).
 *
 * Run with: pnpm fix:vercel-db-scoping
 *
 * Verify afterward:
 *   vercel env ls | grep "DATABASE_URL "
 */
import { execFileSync } from "node:child_process";
import { reapplyDbScoping } from "../lib/vercel-db-scoping";

const NEON_PROJECT_ID = "aged-resonance-61061629";

function getConnectionString(branch: string): string {
  return execFileSync(
    "neonctl",
    ["connection-string", branch, "--project-id", NEON_PROJECT_ID, "--pooled"],
    { encoding: "utf8" },
  ).trim();
}

function setVercelEnv(
  name: string,
  environment: "production" | "development",
  value: string,
): void {
  execFileSync("vercel", ["env", "add", name, environment, "--value", value, "--yes", "--force"], {
    stdio: "inherit",
  });
}

reapplyDbScoping(
  {
    getProduction: () => getConnectionString("main"),
    getTest: () => getConnectionString("test"),
  },
  { set: setVercelEnv },
);

console.log("\nDone. Verify with: vercel env ls | grep 'DATABASE_URL '");
