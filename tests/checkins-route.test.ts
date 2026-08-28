import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { accounts, checkIns, getDb } from "../lib/db";
import { createSessionToken, deleteAccount, hashPasscode, SESSION_COOKIE } from "../lib/auth";
import { GET, PUT } from "../app/api/checkins/route";

const createdAccountIds: number[] = [];
const WEEK_START = "2026-02-02";

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
  await Promise.all(createdAccountIds.map(deleteAccount));
  createdAccountIds.length = 0;
});

function requestWithSession(method: "GET" | "PUT", accountId: number, body?: unknown, weekStart = WEEK_START) {
  const token = createSessionToken({ accountId, role: "client" });
  const url =
    method === "GET"
      ? `http://localhost/api/checkins?weekStart=${weekStart}`
      : "http://localhost/api/checkins";
  return new NextRequest(url, {
    method,
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("two accounts can each have their own check-in row for the same week", async () => {
  const a = await makeAccount("Checkins Route Test A");
  const b = await makeAccount("Checkins Route Test B");

  const putA = await PUT(
    requestWithSession("PUT", a, { weekStart: WEEK_START, manualNotes: "A's notes" }),
  );
  assert.equal(putA.status, 200);
  const putB = await PUT(
    requestWithSession("PUT", b, { weekStart: WEEK_START, manualNotes: "B's notes" }),
  );
  assert.equal(putB.status, 200);

  const getA = await GET(requestWithSession("GET", a));
  const jsonA = await getA.json();
  assert.equal(jsonA.checkIn.manualNotes, "A's notes");

  const getB = await GET(requestWithSession("GET", b));
  const jsonB = await getB.json();
  assert.equal(jsonB.checkIn.manualNotes, "B's notes");
});

test("re-PUTting the same account+week upserts in place rather than duplicating", async () => {
  const a = await makeAccount("Checkins Route Test Upsert");

  await PUT(requestWithSession("PUT", a, { weekStart: WEEK_START, manualNotes: "first" }));
  await PUT(requestWithSession("PUT", a, { weekStart: WEEK_START, manualNotes: "second" }));

  const db = await getDb();
  const rows = await db.select().from(checkIns).where(inArray(checkIns.accountId, [a]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].manualNotes, "second");
});
