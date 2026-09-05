import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  dailyActivity,
  getDb,
  hydrationEntries,
  nutritionEntries,
  sleepSessions,
  weightEntries,
  workouts,
} from "../lib/db";
import { POST } from "../app/api/ingest/[type]/route";
import { createAccountTracker } from "./helpers";

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

function ingestRequest(type: string, body: unknown) {
  return new NextRequest(`http://localhost/api/ingest/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function nutritionRequest(body: unknown) {
  return ingestRequest("nutrition", body);
}

function nutritionBatch(referenceId: string, records: unknown[]) {
  return { deviceId: "test-device", referenceId, source: "myfitnesspal", records };
}

function batch(referenceId: string, source: string, records: unknown[]) {
  return { deviceId: "test-device", referenceId, source, records };
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

test("an absurd weight value is rejected with a 422, not silently accepted", async () => {
  const account = await makeAccount("Ingest Route Test Weight Bounds");
  const res = await POST(
    ingestRequest(
      "weight",
      batch(account.referenceId, "samsung_health", [
        { hcUid: "weight-bounds-1", time: "2026-08-19T12:00:00.000Z", weightKg: 1e12 },
      ]),
    ),
    { params: Promise.resolve({ type: "weight" }) },
  );
  assert.equal(res.status, 422);

  const db = await getDb();
  const [row] = await db.select().from(weightEntries).where(eq(weightEntries.hcUid, "weight-bounds-1"));
  assert.equal(row, undefined);
});

test("an empty batch is rejected with a 422 rather than round-tripping through auth and the sync log", async () => {
  const account = await makeAccount("Ingest Route Test Empty Batch");
  const res = await POST(nutritionRequest(nutritionBatch(account.referenceId, [])), {
    params: Promise.resolve({ type: "nutrition" }),
  });
  assert.equal(res.status, 422);
});

test("two accounts syncing weight with the same hcUid don't collide", async () => {
  const a = await makeAccount("Ingest Route Test Weight A");
  const b = await makeAccount("Ingest Route Test Weight B");
  const record = { hcUid: "shared-weight-uid", time: "2026-08-19T12:00:00.000Z", weightKg: 80 };

  const resA = await POST(ingestRequest("weight", batch(a.referenceId, "samsung_health", [record])), {
    params: Promise.resolve({ type: "weight" }),
  });
  const resB = await POST(ingestRequest("weight", batch(b.referenceId, "samsung_health", [record])), {
    params: Promise.resolve({ type: "weight" }),
  });
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);

  const db = await getDb();
  const rows = await db.select().from(weightEntries).where(eq(weightEntries.hcUid, "shared-weight-uid"));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.accountId).sort(), [a.id, b.id].sort());
});

test("two accounts syncing hydration with the same hcUid don't collide", async () => {
  const a = await makeAccount("Ingest Route Test Hydration A");
  const b = await makeAccount("Ingest Route Test Hydration B");
  const record = { hcUid: "shared-hydration-uid", startTime: "2026-08-19T12:00:00.000Z", volumeMl: 500 };

  const resA = await POST(
    ingestRequest("hydration", batch(a.referenceId, "samsung_health", [record])),
    { params: Promise.resolve({ type: "hydration" }) },
  );
  const resB = await POST(
    ingestRequest("hydration", batch(b.referenceId, "samsung_health", [record])),
    { params: Promise.resolve({ type: "hydration" }) },
  );
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);

  const db = await getDb();
  const rows = await db
    .select()
    .from(hydrationEntries)
    .where(eq(hydrationEntries.hcUid, "shared-hydration-uid"));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.accountId).sort(), [a.id, b.id].sort());
});

test("two accounts syncing sleep with the same hcUid don't collide", async () => {
  const a = await makeAccount("Ingest Route Test Sleep A");
  const b = await makeAccount("Ingest Route Test Sleep B");
  const record = {
    hcUid: "shared-sleep-uid",
    startTime: "2026-08-19T02:00:00.000Z",
    endTime: "2026-08-19T10:00:00.000Z",
  };

  const resA = await POST(ingestRequest("sleep", batch(a.referenceId, "samsung_health", [record])), {
    params: Promise.resolve({ type: "sleep" }),
  });
  const resB = await POST(ingestRequest("sleep", batch(b.referenceId, "samsung_health", [record])), {
    params: Promise.resolve({ type: "sleep" }),
  });
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);

  const db = await getDb();
  const rows = await db.select().from(sleepSessions).where(eq(sleepSessions.hcUid, "shared-sleep-uid"));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.accountId).sort(), [a.id, b.id].sort());
});

test("two accounts syncing an exercise session with the same hcUid don't collide", async () => {
  const a = await makeAccount("Ingest Route Test Exercise A");
  const b = await makeAccount("Ingest Route Test Exercise B");
  const record = { hcUid: "shared-exercise-uid", startTime: "2026-08-19T12:00:00.000Z" };

  const resA = await POST(
    ingestRequest("exercise", batch(a.referenceId, "samsung_health", [record])),
    { params: Promise.resolve({ type: "exercise" }) },
  );
  const resB = await POST(
    ingestRequest("exercise", batch(b.referenceId, "samsung_health", [record])),
    { params: Promise.resolve({ type: "exercise" }) },
  );
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);

  const db = await getDb();
  const rows = await db.select().from(workouts).where(eq(workouts.hcUid, "shared-exercise-uid"));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.accountId).sort(), [a.id, b.id].sort());
});

test("two accounts syncing activity for the same local date don't collide", async () => {
  const a = await makeAccount("Ingest Route Test Activity A");
  const b = await makeAccount("Ingest Route Test Activity B");
  const record = { hcUid: "activity-2026-08-19", date: "2026-08-19", steps: 8000 };

  const resA = await POST(
    ingestRequest("activity", batch(a.referenceId, "samsung_health", [record])),
    { params: Promise.resolve({ type: "activity" }) },
  );
  const resB = await POST(
    ingestRequest("activity", batch(b.referenceId, "samsung_health", [{ ...record, steps: 5000 }])),
    { params: Promise.resolve({ type: "activity" }) },
  );
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);

  const db = await getDb();
  const rows = await db.select().from(dailyActivity).where(eq(dailyActivity.localDate, "2026-08-19"));
  assert.equal(rows.length, 2);
  const byAccount = Object.fromEntries(rows.map((r) => [r.accountId, r.steps]));
  assert.equal(byAccount[a.id], 8000);
  assert.equal(byAccount[b.id], 5000);
});
