import assert from "node:assert/strict";
import { test } from "vitest";
import { eq } from "drizzle-orm";
import { deleteAccount, hashPasscode, verifyPasscode } from "../lib/auth";
import { accounts, getDb } from "../lib/db";
import { resetDemoPasscodes } from "../lib/reset-demo-passcodes";

// Uses its own uniquely-named accounts, passed explicitly via
// resetDemoPasscodes()'s `names` param, rather than the real
// "Demo Coach"/"Demo Client" default — this suite shares the local
// .data/pglite dev database with other tests (vitest.config.mts), and those
// names may already be real, in-use accounts seeded by `pnpm seed`.
async function makeAccount(name: string, role: "coach" | "client", passcode: string) {
  const db = await getDb();
  const passcodeHash = await hashPasscode(passcode);
  const [row] = await db.insert(accounts).values({ name, role, passcodeHash }).returning();
  return row.id;
}

test("resets an existing account's passcode to a new value", async () => {
  const accountId = await makeAccount("Reset Test Coach", "coach", "old-coach-passcode");
  try {
    const results = await resetDemoPasscodes(await getDb(), ["Reset Test Coach"]);

    assert.equal(results.length, 1);
    assert.equal(results[0].name, "Reset Test Coach");
    assert.equal(results[0].accountId, accountId);

    const db = await getDb();
    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    assert.equal(await verifyPasscode(results[0].passcode, row.passcodeHash), true);
    assert.equal(await verifyPasscode("old-coach-passcode", row.passcodeHash), false);
  } finally {
    await deleteAccount(accountId);
  }
});

test("resets every name given that has a matching account", async () => {
  const coachId = await makeAccount("Reset Test Coach", "coach", "old-coach-passcode");
  const clientId = await makeAccount("Reset Test Client", "client", "old-client-passcode");
  try {
    const results = await resetDemoPasscodes(await getDb(), [
      "Reset Test Coach",
      "Reset Test Client",
    ]);
    const names = results.map((r) => r.name).sort();
    assert.deepEqual(names, ["Reset Test Client", "Reset Test Coach"]);
  } finally {
    await deleteAccount(coachId);
    await deleteAccount(clientId);
  }
});

test("skips a name with no matching account, without touching unrelated accounts", async () => {
  const otherId = await makeAccount("Reset Test Unrelated", "client", "unrelated-passcode");
  try {
    const results = await resetDemoPasscodes(await getDb(), ["Reset Test Nonexistent"]);
    assert.equal(results.length, 0);

    const db = await getDb();
    const [row] = await db.select().from(accounts).where(eq(accounts.id, otherId));
    assert.equal(await verifyPasscode("unrelated-passcode", row.passcodeHash), true);
  } finally {
    await deleteAccount(otherId);
  }
});
