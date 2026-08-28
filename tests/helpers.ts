import { accounts, getDb } from "../lib/db";
import { deleteAccount, hashPasscode } from "../lib/auth";

export interface TestAccount {
  id: number;
  referenceId: string;
}

/** Tracks the accounts a test file creates so its own afterEach can clean
 *  them up in one call. Each test file gets its own isolated tracker rather
 *  than sharing one mutable list across files. */
export function createAccountTracker() {
  const createdAccountIds: number[] = [];

  async function makeAccount(name: string): Promise<TestAccount> {
    const db = await getDb();
    const passcodeHash = await hashPasscode(`${name}-passcode`);
    const [row] = await db
      .insert(accounts)
      .values({ name, role: "client", passcodeHash })
      .returning();
    createdAccountIds.push(row.id);
    return { id: row.id, referenceId: row.referenceId };
  }

  async function cleanup(): Promise<void> {
    await Promise.all(createdAccountIds.map(deleteAccount));
    createdAccountIds.length = 0;
  }

  return { makeAccount, cleanup };
}
