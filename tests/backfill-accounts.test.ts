import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { backfillAccounts } from "../lib/backfill-accounts";
import { accounts, getDb } from "../lib/db";
import { verifyPasscode } from "../lib/auth";

// VIK-78 made account_id NOT NULL on every account-scoped table, so an
// "unassigned" row can no longer exist to reassign — the reassignment step
// below is now permanently a no-op (kept for historical/idempotency
// documentation; see specs/client-accounts.md's "Backfill migration" note).
test("backfill's reassignment step is a no-op now that account_id can't be null", async () => {
  const db = await getDb();
  const result = await backfillAccounts(db, {
    coach: { name: "Test Vik", passcode: "coach-passcode-1" },
    client: { name: "Test Spouse", passcode: "client-passcode-1" },
  });

  for (const count of Object.values(result.reassignedRowCounts)) {
    assert.equal(count, 0);
  }
});

test("backfill creates the coach and client accounts with correct roles and passcodes", async () => {
  const db = await getDb();
  const result = await backfillAccounts(db, {
    coach: { name: "Test Vik", passcode: "coach-passcode-1" },
    client: { name: "Test Spouse", passcode: "client-passcode-1" },
  });

  const [coach] = await db.select().from(accounts).where(eq(accounts.id, result.coachAccountId));
  const [client] = await db.select().from(accounts).where(eq(accounts.id, result.clientAccountId));

  assert.equal(coach.role, "coach");
  assert.equal(await verifyPasscode("coach-passcode-1", coach.passcodeHash), true);
  assert.equal(client.role, "client");
  assert.equal(await verifyPasscode("client-passcode-1", client.passcodeHash), true);
});

test("backfill is idempotent: re-running finds the same accounts instead of duplicating", async () => {
  const db = await getDb();
  const first = await backfillAccounts(db, {
    coach: { name: "Test Vik", passcode: "coach-passcode-1" },
    client: { name: "Test Spouse", passcode: "client-passcode-1" },
  });
  const second = await backfillAccounts(db, {
    coach: { name: "Test Vik", passcode: "coach-passcode-1" },
    client: { name: "Test Spouse", passcode: "client-passcode-1" },
  });

  assert.equal(second.coachAccountId, first.coachAccountId);
  assert.equal(second.clientAccountId, first.clientAccountId);
});

test("backfill rolls back the coach account if creating the client account fails partway through", async () => {
  const db = await getDb();
  const coachName = `Rollback Coach ${crypto.randomUUID()}`;
  const clientName = `Rollback Client ${crypto.randomUUID()}`;

  // Force the second account-creating insert (the client) to fail so we can
  // verify the first (the coach) doesn't survive — i.e. the whole thing runs
  // in one transaction rather than as independent statements.
  const originalTransaction = db.transaction.bind(db);
  const transactionSpy = vi.spyOn(db, "transaction").mockImplementation(
    // Mocking machinery below needs to accept whichever driver's transaction
    // shape (Pglite vs postgres-js) the test happens to run against.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (callback: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      originalTransaction(async (tx: any) => {
        let insertCalls = 0;
        const originalInsert = tx.insert.bind(tx);
        tx.insert = (...args: unknown[]) => {
          insertCalls++;
          if (insertCalls === 2) {
            throw new Error("simulated failure creating the client account");
          }
          return originalInsert(...args);
        };
        return callback(tx);
      }),
  );

  try {
    await assert.rejects(
      backfillAccounts(db, {
        coach: { name: coachName, passcode: "coach-passcode-1" },
        client: { name: clientName, passcode: "client-passcode-1" },
      }),
      /simulated failure creating the client account/,
    );
  } finally {
    transactionSpy.mockRestore();
  }

  const coachRows = await db.select().from(accounts).where(eq(accounts.name, coachName));
  assert.equal(coachRows.length, 0, "coach account should have been rolled back with the rest of the transaction");
});
