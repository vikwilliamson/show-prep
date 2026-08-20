import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import {
  accounts,
  getDb,
  nutritionEntries,
  settings,
  syncLog,
} from "../lib/db";
import { hashPasscode } from "../lib/auth";
import { POST } from "../app/api/ingest/[type]/route";

const createdAccountIds: number[] = [];

async function makeAccount(name: string): Promise<{ id: number; referenceId: string }> {
  const db = await getDb();
  const passcodeHash = await hashPasscode(`${name}-passcode`);
  const [row] = await db
    .insert(accounts)
    .values({ name, role: "client", passcodeHash })
    .returning();
  createdAccountIds.push(row.id);
  return { id: row.id, referenceId: row.referenceId };
}

afterEach(async () => {
  const db = await getDb();
  if (createdAccountIds.length === 0) return;
  // Children first — accounts.id has no ON DELETE CASCADE. The ingest route
  // lazily creates a settings row per account (for the timezone lookup).
  await db.delete(nutritionEntries).where(inArray(nutritionEntries.accountId, createdAccountIds));
  await db.delete(syncLog).where(inArray(syncLog.accountId, createdAccountIds));
  await db.delete(settings).where(inArray(settings.accountId, createdAccountIds));
  await db.delete(accounts).where(inArray(accounts.id, createdAccountIds));
  createdAccountIds.length = 0;
});

function nutritionRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ingest/nutrition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function nutritionBatch(referenceId: string, records: unknown[]) {
  return { deviceId: "test-device", referenceId, source: "myfitnesspal", records };
}

const oneMeal = (hcUid: string) => ({
  hcUid,
  startTime: "2026-08-19T12:00:00.000Z",
  mealType: "lunch",
  calories: 600,
  proteinG: 40,
  carbsG: 60,
  fatG: 20,
});

test("POST /api/ingest/nutrition tags inserted rows with the posting account's accountId", async () => {
  const account = await makeAccount("Ingest Route Test Owner");
  const res = await POST(
    nutritionRequest(nutritionBatch(account.referenceId, [oneMeal("ref-owner-1")])),
    { params: Promise.resolve({ type: "nutrition" }) },
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.accepted, 1);

  const db = await getDb();
  const [row] = await db
    .select()
    .from(nutritionEntries)
    .where(eq(nutritionEntries.hcUid, "ref-owner-1"));
  assert.equal(row.accountId, account.id);
});

test("POST /api/ingest/nutrition with an unresolvable referenceId is rejected, not silently attributed", async () => {
  const res = await POST(
    nutritionRequest(
      nutritionBatch("00000000-0000-0000-0000-000000000000", [oneMeal("ref-unknown-1")]),
    ),
    { params: Promise.resolve({ type: "nutrition" }) },
  );
  assert.equal(res.status, 401);

  const db = await getDb();
  const [row] = await db
    .select()
    .from(nutritionEntries)
    .where(eq(nutritionEntries.hcUid, "ref-unknown-1"));
  assert.equal(row, undefined);
});

test("two accounts syncing nutrition with the same hcUid on the same day don't collide", async () => {
  const a = await makeAccount("Ingest Route Test Collision A");
  const b = await makeAccount("Ingest Route Test Collision B");

  const resA = await POST(
    nutritionRequest(nutritionBatch(a.referenceId, [oneMeal("shared-hc-uid")])),
    { params: Promise.resolve({ type: "nutrition" }) },
  );
  const resB = await POST(
    nutritionRequest(nutritionBatch(b.referenceId, [oneMeal("shared-hc-uid")])),
    { params: Promise.resolve({ type: "nutrition" }) },
  );
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);

  const db = await getDb();
  const rows = await db
    .select()
    .from(nutritionEntries)
    .where(eq(nutritionEntries.hcUid, "shared-hc-uid"));
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.accountId).sort(),
    [a.id, b.id].sort(),
  );
});

test("re-syncing the same account+hcUid upserts in place rather than duplicating", async () => {
  const account = await makeAccount("Ingest Route Test Upsert");
  await POST(
    nutritionRequest(nutritionBatch(account.referenceId, [{ ...oneMeal("upsert-1"), calories: 500 }])),
    { params: Promise.resolve({ type: "nutrition" }) },
  );
  await POST(
    nutritionRequest(nutritionBatch(account.referenceId, [{ ...oneMeal("upsert-1"), calories: 700 }])),
    { params: Promise.resolve({ type: "nutrition" }) },
  );

  const db = await getDb();
  const rows = await db
    .select()
    .from(nutritionEntries)
    .where(eq(nutritionEntries.hcUid, "upsert-1"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].calories, 700);
});

test("an absurd calorie value is rejected with a 422, not silently accepted", async () => {
  const account = await makeAccount("Ingest Route Test Bounds");
  const res = await POST(
    nutritionRequest(
      nutritionBatch(account.referenceId, [{ ...oneMeal("bounds-1"), calories: 1e12 }]),
    ),
    { params: Promise.resolve({ type: "nutrition" }) },
  );
  assert.equal(res.status, 422);

  const db = await getDb();
  const [row] = await db
    .select()
    .from(nutritionEntries)
    .where(eq(nutritionEntries.hcUid, "bounds-1"));
  assert.equal(row, undefined);
});
