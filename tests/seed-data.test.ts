import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { eq } from "drizzle-orm";
import { accounts, documents, getDb, protocols, weightEntries } from "../lib/db";
import { deleteAccount } from "../lib/auth";
import { findOrCreateAccount, seedAccountData, type SeedAccountConfig } from "../lib/seed-data";
import { getSettings, getTargets } from "../lib/stats";

const createdAccountIds: number[] = [];
afterEach(async () => {
  await Promise.all(createdAccountIds.splice(0).map(deleteAccount));
});

function baseConfig(
  overrides: Partial<SeedAccountConfig> & Pick<SeedAccountConfig, "name" | "role" | "passcode">,
): SeedAccountConfig {
  return {
    targetName: "Test Target",
    targetNote: "test note",
    programType: "general_coaching",
    targetDateOffsetDays: 30,
    targetWeightLbs: 180,
    heightInches: 70,
    startWeightLbs: 200,
    endWeightLbs: 190,
    activeCalories: 2000,
    activeProteinG: 180,
    activeCarbsG: 200,
    activeFatG: 60,
    pendingCalories: 1800,
    pendingProteinG: 180,
    pendingCarbsG: 150,
    pendingFatG: 50,
    rngSeed: 1,
    ...overrides,
  };
}

test("findOrCreateAccount creates an account with the given role, and is idempotent", async () => {
  const cfg = baseConfig({ name: "Seed Test Coach", role: "coach", passcode: "x" });
  const id1 = await findOrCreateAccount(cfg);
  createdAccountIds.push(id1);
  const id2 = await findOrCreateAccount(cfg);
  assert.equal(id1, id2, "a second call for the same name should return the same account");

  const db = await getDb();
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id1));
  assert.equal(row.role, "coach");
  assert.equal(row.name, "Seed Test Coach");
});

test("seedAccountData populates settings/targets from the config", async () => {
  const cfg = baseConfig({
    name: "Seed Test Client A",
    role: "client",
    passcode: "x",
    targetName: "Fall Cut",
    targetWeightLbs: 175,
  });
  const accountId = await findOrCreateAccount(cfg);
  createdAccountIds.push(accountId);

  await seedAccountData(accountId, cfg);

  const settingsRow = await getSettings(accountId);
  assert.equal(settingsRow.targetName, "Fall Cut");
  assert.equal(settingsRow.targetWeightLbs, 175);
  assert.equal(settingsRow.programType, "general_coaching");

  const targets = await getTargets(accountId);
  assert.equal(targets.waterMlMin, 3000);
});

test("seedAccountData creates the seed documents and one active + one pending protocol", async () => {
  const cfg = baseConfig({ name: "Seed Test Client B", role: "client", passcode: "x" });
  const accountId = await findOrCreateAccount(cfg);
  createdAccountIds.push(accountId);

  await seedAccountData(accountId, cfg);

  const db = await getDb();
  const docs = await db.select().from(documents).where(eq(documents.accountId, accountId));
  assert.equal(docs.length, 3);

  const protos = await db.select().from(protocols).where(eq(protocols.accountId, accountId));
  assert.deepEqual(
    protos.map((p) => p.status).sort(),
    ["active", "pending"],
  );
});

test("seedAccountData produces non-trivial, account-scoped health data with no cross-account leakage", async () => {
  const cfgA = baseConfig({ name: "Seed Test Health A", role: "client", passcode: "x", rngSeed: 1 });
  const cfgB = baseConfig({ name: "Seed Test Health B", role: "client", passcode: "x", rngSeed: 2 });
  const accountA = await findOrCreateAccount(cfgA);
  const accountB = await findOrCreateAccount(cfgB);
  createdAccountIds.push(accountA, accountB);

  const summaryA = await seedAccountData(accountA, cfgA);
  const summaryB = await seedAccountData(accountB, cfgB);

  assert.ok(summaryA.weightCount > 0);
  assert.ok(summaryA.nutritionCount > 0);
  assert.ok(summaryB.weightCount > 0);

  const db = await getDb();
  const weightsA = await db.select().from(weightEntries).where(eq(weightEntries.accountId, accountA));
  const weightsB = await db.select().from(weightEntries).where(eq(weightEntries.accountId, accountB));
  assert.equal(weightsA.length, summaryA.weightCount);
  assert.equal(weightsB.length, summaryB.weightCount);
  assert.ok(weightsA.every((w) => w.accountId === accountA), "no row from B leaked into A");
  assert.ok(weightsB.every((w) => w.accountId === accountB), "no row from A leaked into B");
});

test("seedAccountData is idempotent: reseeding the same account doesn't duplicate protocols/documents", async () => {
  const cfg = baseConfig({ name: "Seed Test Reseed", role: "client", passcode: "x" });
  const accountId = await findOrCreateAccount(cfg);
  createdAccountIds.push(accountId);

  await seedAccountData(accountId, cfg);
  await seedAccountData(accountId, cfg);

  const db = await getDb();
  const docs = await db.select().from(documents).where(eq(documents.accountId, accountId));
  assert.equal(docs.length, 3);
  const protos = await db.select().from(protocols).where(eq(protocols.accountId, accountId));
  assert.equal(protos.length, 2);
});
