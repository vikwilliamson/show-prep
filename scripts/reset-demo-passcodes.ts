/**
 * One-off: resets the passcode on the existing "Demo Coach"/"Demo Client"
 * accounts (seeded by scripts/seed.ts) and prints the new plaintext values
 * once. Needed because passcodes are only ever stored hashed — there's no
 * way to recover a lost one, and re-running `pnpm seed` does nothing for an
 * account that already exists (see lib/reset-demo-passcodes.ts).
 *
 * Run against local dev first to verify (PGlite, disposable):
 *   pnpm reset-demo-passcodes
 *
 * Only point DATABASE_URL at a real environment (test/staging/production)
 * once you've confirmed the behavior locally.
 */
import { getDb } from "../lib/db";
import { resetDemoPasscodes } from "../lib/reset-demo-passcodes";

async function main() {
  const db = await getDb();
  const results = await resetDemoPasscodes(db);

  if (results.length === 0) {
    console.log("No demo accounts found in this database — nothing to reset.");
    return;
  }

  for (const { name, accountId, passcode } of results) {
    console.log(`${name} (account #${accountId}): ${passcode}`);
  }
  console.log("\nShown once — write these down now.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
