/**
 * One-time migration: creates the coach account (you) and an empty client
 * account (spouse), and assigns every existing unassigned row to the coach
 * account. Idempotent — safe to re-run.
 *
 * Run against local dev first to verify (PGlite, disposable):
 *   COACH_NAME="Vik" COACH_PASSCODE="..." CLIENT_NAME="..." CLIENT_PASSCODE="..." \
 *     node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx scripts/backfill-accounts.ts
 *
 * Only point DATABASE_URL at production once you've verified against local
 * dev and taken a Neon backup/branch snapshot immediately before — see
 * specs/client-accounts.md.
 */
import { backfillAccounts } from "../lib/backfill-accounts";
import { getDb } from "../lib/db";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required (see the usage comment at the top of this script).`);
  }
  return value;
}

async function main() {
  const db = await getDb();
  const result = await backfillAccounts(db, {
    coach: { name: requireEnv("COACH_NAME"), passcode: requireEnv("COACH_PASSCODE") },
    client: { name: requireEnv("CLIENT_NAME"), passcode: requireEnv("CLIENT_PASSCODE") },
  });

  console.log(`Coach account id: ${result.coachAccountId}`);
  console.log(`Client account id: ${result.clientAccountId}`);
  console.log("Rows reassigned to the coach account:");
  for (const [table, count] of Object.entries(result.reassignedRowCounts)) {
    console.log(`  ${table}: ${count}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
