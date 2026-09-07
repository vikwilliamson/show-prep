import assert from "node:assert/strict";
import { test } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db";

// VIK-95: unique-index names had drifted from their table names in three
// different, inconsistent ways (drop "_entries", drop "_sessions", drop the
// "daily_" prefix, drop the plural "s") — this asserts the fixed convention
// (every index prefixed with its exact table name) actually landed in the
// database, not just in lib/db/schema.ts's source.
test("account-scoped unique indexes are prefixed with their exact table name", async () => {
  const db = await getDb();
  const result = await db.execute(
    sql`select indexname from pg_indexes where schemaname = 'public'`,
  );
  const rows = Array.isArray(result)
    ? result
    : (result as unknown as { rows: { indexname: string }[] }).rows;
  const names = new Set(rows.map((r) => r.indexname as string));

  const expected = [
    "nutrition_entries_hc_uid_idx",
    "weight_entries_hc_uid_idx",
    "hydration_entries_hc_uid_idx",
    "workouts_hc_uid_idx",
    "sleep_sessions_hc_uid_idx",
    "daily_activity_hc_uid_idx",
    "daily_activity_local_date_idx",
    "check_ins_account_week_idx",
    "coach_briefs_account_week_idx",
  ];
  for (const name of expected) {
    assert.ok(names.has(name), `expected index ${name} to exist`);
  }

  const stale = [
    "nutrition_hc_uid_idx",
    "weight_hc_uid_idx",
    "hydration_hc_uid_idx",
    "workout_hc_uid_idx",
    "sleep_hc_uid_idx",
    "activity_hc_uid_idx",
    "activity_local_date_idx",
    "checkin_account_week_idx",
    "coach_brief_account_week_idx",
  ];
  for (const name of stale) {
    assert.ok(
      !names.has(name),
      `stale index name ${name} should no longer exist`,
    );
  }
});
