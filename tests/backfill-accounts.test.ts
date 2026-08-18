import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { eq } from "drizzle-orm";
import { backfillAccounts } from "../lib/backfill-accounts";
import { accounts, checkIns, getDb } from "../lib/db";
import { verifyPasscode } from "../lib/auth";

const SENTINEL_WEEK_START = "1901-01-07";

afterEach(async () => {
  const db = await getDb();
  await db.delete(checkIns).where(eq(checkIns.weekStart, SENTINEL_WEEK_START));
});

test("backfill assigns an unassigned row to a newly created coach account", async () => {
  const db = await getDb();
  await db.insert(checkIns).values({ weekStart: SENTINEL_WEEK_START, dataAnswers: {} });

  const result = await backfillAccounts(db, {
    coach: { name: "Test Vik", passcode: "coach-passcode-1" },
    client: { name: "Test Spouse", passcode: "client-passcode-1" },
  });

  const [row] = await db.select().from(checkIns).where(eq(checkIns.weekStart, SENTINEL_WEEK_START));
  assert.equal(row.accountId, result.coachAccountId);
  assert.ok(result.reassignedRowCounts.check_ins >= 1);
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
