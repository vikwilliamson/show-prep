import { eq } from "drizzle-orm";
import { generatePasscode, hashPasscode } from "./auth";
import { accounts, type Db } from "./db";

// Resets the passcode on whichever of "Demo Coach"/"Demo Client" already
// exist in this database and returns the new plaintext values — the only
// way to recover access to an already-seeded demo account, since passcodes
// are only ever stored hashed and lib/seed-data.ts's findOrCreateAccount()
// never overwrites an existing account's passcode on a re-seed.
export const DEMO_ACCOUNT_NAMES = ["Demo Coach", "Demo Client"] as const;

export interface ResetResult {
  name: string;
  accountId: number;
  passcode: string;
}

export async function resetDemoPasscodes(
  db: Db,
  names: readonly string[] = DEMO_ACCOUNT_NAMES,
): Promise<ResetResult[]> {
  const results: ResetResult[] = [];

  for (const name of names) {
    const [existing] = await db.select().from(accounts).where(eq(accounts.name, name));
    if (!existing) continue;

    const passcode = generatePasscode();
    const passcodeHash = await hashPasscode(passcode);
    await db.update(accounts).set({ passcodeHash }).where(eq(accounts.id, existing.id));
    results.push({ name, accountId: existing.id, passcode });
  }

  return results;
}
