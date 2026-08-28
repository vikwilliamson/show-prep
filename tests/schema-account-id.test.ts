import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  accounts,
  chatMessages,
  checkIns,
  dailyActivity,
  documentChunks,
  documents,
  getDb,
  hydrationEntries,
  nutritionEntries,
  protocols,
  settings,
  sleepSessions,
  syncLog,
  weeklyTargets,
  weightEntries,
  workouts,
} from "../lib/db";
import { createAccountTracker } from "./helpers";

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

// Every account-scoped table besides `accounts` itself.
const CHILD_TABLES = [
  documentChunks,
  documents,
  protocols,
  nutritionEntries,
  weightEntries,
  hydrationEntries,
  workouts,
  sleepSessions,
  dailyActivity,
  syncLog,
  weeklyTargets,
  checkIns,
  settings,
  chatMessages,
];

// The tables above don't share a common interface exposing `accountId`
// generically, so this centralizes the one cast rather than repeating it.
function accountIdColumnOf(table: (typeof CHILD_TABLES)[number]) {
  return (table as { accountId: (typeof CHILD_TABLES)[number]["accountId"] }).accountId;
}

test("account_id is NOT NULL on every account-scoped table", async () => {
  const db = await getDb();
  const { id: a } = await makeAccount("Schema NotNull Test");
  const [doc] = await db
    .insert(documents)
    .values({ accountId: a, title: "t", sourceType: "txt", contentText: "c" })
    .returning();

  const cases: Array<[string, (typeof CHILD_TABLES)[number], Record<string, unknown>]> = [
    ["documents", documents, { title: "t", sourceType: "txt", contentText: "c" }],
    ["document_chunks", documentChunks, { documentId: doc.id, chunkIndex: 0, content: "c" }],
    ["protocols", protocols, { effectiveFrom: "2026-01-01" }],
    ["nutrition_entries", nutritionEntries, { localDate: "2026-01-01", mealType: "breakfast", calories: 100 }],
    ["weight_entries", weightEntries, { measuredAt: new Date(), localDate: "2026-01-01", weightLbs: 150 }],
    ["hydration_entries", hydrationEntries, { localDate: "2026-01-01", volumeMl: 500 }],
    ["workouts", workouts, { localDate: "2026-01-01", startedAt: new Date() }],
    [
      "sleep_sessions",
      sleepSessions,
      { localDate: "2026-01-01", startedAt: new Date(), endedAt: new Date(), durationMin: 60 },
    ],
    ["daily_activity", dailyActivity, { localDate: "2026-01-01" }],
    ["sync_log", syncLog, { deviceId: "d1", recordCount: 1, status: "ok" }],
    ["weekly_targets", weeklyTargets, {}],
    ["check_ins", checkIns, { weekStart: "2026-01-01" }],
    ["settings", settings, { checkinTemplate: [] }],
    ["chat_messages", chatMessages, { role: "user", content: "hi" }],
  ];

  for (const [name, table, values] of cases) {
    await assert.rejects(
      () => db.insert(table).values(values as never),
      `${name} should reject an insert with a null account_id`,
    );
  }
});

test("deleting an account cascades to delete every child table's rows", async () => {
  const db = await getDb();
  const { id: a } = await makeAccount("Schema Cascade Test");

  const [doc] = await db
    .insert(documents)
    .values({ accountId: a, title: "t", sourceType: "txt", contentText: "c" })
    .returning();
  await db.insert(documentChunks).values({ accountId: a, documentId: doc.id, chunkIndex: 0, content: "c" });
  await db.insert(protocols).values({ accountId: a, effectiveFrom: "2026-01-01" });
  await db.insert(nutritionEntries).values({
    accountId: a,
    localDate: "2026-01-01",
    mealType: "breakfast",
    calories: 100,
  });
  await db.insert(weightEntries).values({
    accountId: a,
    measuredAt: new Date(),
    localDate: "2026-01-01",
    weightLbs: 150,
  });
  await db.insert(hydrationEntries).values({ accountId: a, localDate: "2026-01-01", volumeMl: 500 });
  await db.insert(workouts).values({ accountId: a, localDate: "2026-01-01", startedAt: new Date() });
  await db.insert(sleepSessions).values({
    accountId: a,
    localDate: "2026-01-01",
    startedAt: new Date(),
    endedAt: new Date(),
    durationMin: 60,
  });
  await db.insert(dailyActivity).values({ accountId: a, localDate: "2026-01-01" });
  await db.insert(syncLog).values({ accountId: a, deviceId: "d1", recordCount: 1, status: "ok" });
  await db.insert(weeklyTargets).values({ accountId: a });
  await db.insert(checkIns).values({ accountId: a, weekStart: "2026-01-01" });
  await db.insert(settings).values({ accountId: a, checkinTemplate: [] });
  await db.insert(chatMessages).values({ accountId: a, role: "user", content: "hi" });

  await db.delete(accounts).where(eq(accounts.id, a));

  for (const table of CHILD_TABLES) {
    const rows = await db
      .select()
      .from(table as never)
      .where(eq(accountIdColumnOf(table), a));
    assert.equal(rows.length, 0, `expected no remaining rows for this account`);
  }
});
