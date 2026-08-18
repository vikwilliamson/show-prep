import { eq, isNull } from "drizzle-orm";
import { hashPasscode } from "./auth";
import {
  accounts,
  chatMessages,
  checkIns,
  dailyActivity,
  documentChunks,
  documents,
  hydrationEntries,
  nutritionEntries,
  protocols,
  settings,
  sleepSessions,
  syncLog,
  weeklyTargets,
  weightEntries,
  workouts,
  type Db,
} from "./db";

export interface BackfillPerson {
  name: string;
  passcode: string;
}

export interface BackfillResult {
  coachAccountId: number;
  clientAccountId: number;
  reassignedRowCounts: Record<string, number>;
}

async function findOrCreateAccount(
  db: Db,
  role: "coach" | "client",
  person: BackfillPerson,
): Promise<number> {
  const existing = await db.select().from(accounts).where(eq(accounts.name, person.name));
  if (existing[0]) return existing[0].id;
  const passcodeHash = await hashPasscode(person.passcode);
  const [row] = await db.insert(accounts).values({ name: person.name, role, passcodeHash }).returning();
  return row.id;
}

// Assigns every currently-unassigned row (account_id IS NULL) in every
// per-user table to the coach account — everything that predates accounts
// existing is the coach's own real data. The client account starts empty.
// Idempotent: re-running finds the existing accounts by name instead of
// duplicating them, and reassigns nothing that's already assigned.
export async function backfillAccounts(
  db: Db,
  options: { coach: BackfillPerson; client: BackfillPerson },
): Promise<BackfillResult> {
  const coachAccountId = await findOrCreateAccount(db, "coach", options.coach);
  const clientAccountId = await findOrCreateAccount(db, "client", options.client);
  const c = coachAccountId;

  const reassignedRowCounts: Record<string, number> = {
    documents: (
      await db.update(documents).set({ accountId: c }).where(isNull(documents.accountId)).returning()
    ).length,
    document_chunks: (
      await db
        .update(documentChunks)
        .set({ accountId: c })
        .where(isNull(documentChunks.accountId))
        .returning()
    ).length,
    protocols: (
      await db.update(protocols).set({ accountId: c }).where(isNull(protocols.accountId)).returning()
    ).length,
    nutrition_entries: (
      await db
        .update(nutritionEntries)
        .set({ accountId: c })
        .where(isNull(nutritionEntries.accountId))
        .returning()
    ).length,
    weight_entries: (
      await db
        .update(weightEntries)
        .set({ accountId: c })
        .where(isNull(weightEntries.accountId))
        .returning()
    ).length,
    hydration_entries: (
      await db
        .update(hydrationEntries)
        .set({ accountId: c })
        .where(isNull(hydrationEntries.accountId))
        .returning()
    ).length,
    workouts: (
      await db.update(workouts).set({ accountId: c }).where(isNull(workouts.accountId)).returning()
    ).length,
    sleep_sessions: (
      await db
        .update(sleepSessions)
        .set({ accountId: c })
        .where(isNull(sleepSessions.accountId))
        .returning()
    ).length,
    daily_activity: (
      await db
        .update(dailyActivity)
        .set({ accountId: c })
        .where(isNull(dailyActivity.accountId))
        .returning()
    ).length,
    sync_log: (
      await db.update(syncLog).set({ accountId: c }).where(isNull(syncLog.accountId)).returning()
    ).length,
    weekly_targets: (
      await db
        .update(weeklyTargets)
        .set({ accountId: c })
        .where(isNull(weeklyTargets.accountId))
        .returning()
    ).length,
    check_ins: (
      await db.update(checkIns).set({ accountId: c }).where(isNull(checkIns.accountId)).returning()
    ).length,
    settings: (
      await db.update(settings).set({ accountId: c }).where(isNull(settings.accountId)).returning()
    ).length,
    chat_messages: (
      await db
        .update(chatMessages)
        .set({ accountId: c })
        .where(isNull(chatMessages.accountId))
        .returning()
    ).length,
  };

  return { coachAccountId, clientAccountId, reassignedRowCounts };
}
