import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  accounts,
  getDb,
  nutritionEntries,
  protocols,
  settings,
  weeklyTargets,
  weightEntries,
} from "../lib/db";
import { hashPasscode } from "../lib/auth";
import {
  dailyMacros,
  dailyWeights,
  effectiveMacroTargets,
  getActiveProtocol,
  getSettings,
  getTargets,
} from "../lib/stats";

const createdAccountIds: number[] = [];

async function makeAccount(name: string): Promise<number> {
  const db = await getDb();
  const passcodeHash = await hashPasscode(`${name}-passcode`);
  const [row] = await db
    .insert(accounts)
    .values({ name, role: "client", passcodeHash })
    .returning();
  createdAccountIds.push(row.id);
  return row.id;
}

afterEach(async () => {
  const db = await getDb();
  if (createdAccountIds.length === 0) return;
  // Children first — accounts.id has no ON DELETE CASCADE.
  await db.delete(settings).where(inArray(settings.accountId, createdAccountIds));
  await db.delete(weeklyTargets).where(inArray(weeklyTargets.accountId, createdAccountIds));
  await db.delete(nutritionEntries).where(inArray(nutritionEntries.accountId, createdAccountIds));
  await db.delete(weightEntries).where(inArray(weightEntries.accountId, createdAccountIds));
  await db.delete(protocols).where(inArray(protocols.accountId, createdAccountIds));
  await db.delete(accounts).where(inArray(accounts.id, createdAccountIds));
  createdAccountIds.length = 0;
});

test("getSettings lazily creates one default row per account", async () => {
  const a = await makeAccount("Stats Test Settings A");
  const b = await makeAccount("Stats Test Settings B");

  const sa = await getSettings(a);
  const sb = await getSettings(b);

  assert.notEqual(sa.id, sb.id);
  assert.equal(sa.accountId, a);
  assert.equal(sb.accountId, b);
  assert.ok(Array.isArray(sa.checkinTemplate));
});

test("getSettings is idempotent: a second call returns the same row, not a duplicate", async () => {
  const a = await makeAccount("Stats Test Settings Idempotent");
  const first = await getSettings(a);
  const second = await getSettings(a);
  assert.equal(first.id, second.id);
});

test("writes to one account's settings are invisible to another account's read", async () => {
  const db = await getDb();
  const a = await makeAccount("Stats Test Isolation A");
  const b = await makeAccount("Stats Test Isolation B");

  const sa = await getSettings(a);
  await db
    .update(settings)
    .set({ targetName: "A's private target" })
    .where(eq(settings.id, sa.id));

  const sb = await getSettings(b);
  assert.equal(sb.targetName, null);

  const saAgain = await getSettings(a);
  assert.equal(saAgain.targetName, "A's private target");
});

test("getTargets lazily creates one default row per account, isolated", async () => {
  const a = await makeAccount("Stats Test Targets A");
  const b = await makeAccount("Stats Test Targets B");

  const ta = await getTargets(a);
  const tb = await getTargets(b);

  assert.notEqual(ta.id, tb.id);
  assert.equal(ta.accountId, a);
  assert.equal(tb.accountId, b);
});

test("dailyWeights and dailyMacros only return the requesting account's rows", async () => {
  const db = await getDb();
  const a = await makeAccount("Stats Test Health A");
  const b = await makeAccount("Stats Test Health B");

  await db.insert(weightEntries).values([
    {
      accountId: a,
      hcUid: "stats-test-weight-a",
      measuredAt: new Date("2026-01-05T14:00:00Z"),
      localDate: "2026-01-05",
      weightLbs: 180,
    },
    {
      accountId: b,
      hcUid: "stats-test-weight-b",
      measuredAt: new Date("2026-01-05T14:00:00Z"),
      localDate: "2026-01-05",
      weightLbs: 250,
    },
  ]);
  await db.insert(nutritionEntries).values([
    {
      accountId: a,
      hcUid: "stats-test-nutrition-a",
      localDate: "2026-01-05",
      mealType: "breakfast",
      calories: 500,
      proteinG: 40,
    },
    {
      accountId: b,
      hcUid: "stats-test-nutrition-b",
      localDate: "2026-01-05",
      mealType: "breakfast",
      calories: 900,
      proteinG: 80,
    },
  ]);

  const weightsA = await dailyWeights(a, "2026-01-01", "2026-01-10");
  const weightsB = await dailyWeights(b, "2026-01-01", "2026-01-10");
  assert.deepEqual(
    weightsA.map((w) => w.weightLbs),
    [180],
  );
  assert.deepEqual(
    weightsB.map((w) => w.weightLbs),
    [250],
  );

  const macrosA = await dailyMacros(a, "2026-01-01", "2026-01-10");
  const macrosB = await dailyMacros(b, "2026-01-01", "2026-01-10");
  assert.equal(macrosA[0]?.calories, 500);
  assert.equal(macrosB[0]?.calories, 900);
});

test("getActiveProtocol only returns the requesting account's active protocol", async () => {
  const db = await getDb();
  const a = await makeAccount("Stats Test Protocol A");
  const b = await makeAccount("Stats Test Protocol B");

  await db.insert(protocols).values([
    { accountId: a, status: "active", effectiveFrom: "2026-01-01", calories: 2100 },
    { accountId: b, status: "active", effectiveFrom: "2026-01-01", calories: 1800 },
  ]);

  const protocolA = await getActiveProtocol(a);
  const protocolB = await getActiveProtocol(b);
  assert.equal(protocolA?.calories, 2100);
  assert.equal(protocolB?.calories, 1800);
});

test("effectiveMacroTargets returns the active protocol's macros when one exists", async () => {
  const db = await getDb();
  const a = await makeAccount("Stats Test EffectiveMacros Protocol");
  const s = await getSettings(a);
  await db
    .update(settings)
    .set({ targetCalories: 1900, targetProteinG: 140, targetCarbsG: 190, targetFatG: 55 })
    .where(eq(settings.id, s.id));
  const updatedSettings = await getSettings(a);

  const [protocol] = await db
    .insert(protocols)
    .values({
      accountId: a,
      status: "active",
      effectiveFrom: "2026-01-01",
      calories: 2200,
      proteinG: 180,
      carbsG: 220,
      fatG: 70,
    })
    .returning();

  const result = effectiveMacroTargets(updatedSettings, protocol);
  assert.deepEqual(result, { calories: 2200, proteinG: 180, carbsG: 220, fatG: 70 });
});

test("effectiveMacroTargets falls back to settings' manual fields when there's no active protocol", async () => {
  const db = await getDb();
  const a = await makeAccount("Stats Test EffectiveMacros Fallback");
  const s = await getSettings(a);
  await db
    .update(settings)
    .set({ targetCalories: 2000, targetProteinG: 150, targetCarbsG: 200, targetFatG: 60 })
    .where(eq(settings.id, s.id));
  const updatedSettings = await getSettings(a);

  const result = effectiveMacroTargets(updatedSettings, null);
  assert.deepEqual(result, { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 });
});

test("effectiveMacroTargets returns nulls when neither protocol nor manual settings are set", async () => {
  const a = await makeAccount("Stats Test EffectiveMacros Neither");
  const s = await getSettings(a);

  const result = effectiveMacroTargets(s, null);
  assert.deepEqual(result, { calories: null, proteinG: null, carbsG: null, fatG: null });
});
