import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import { NextRequest } from "next/server";
import { getDb, accounts } from "../lib/db";
import { deleteAccount, hashPasscode, SESSION_COOKIE, verifySessionToken } from "../lib/auth";
import { POST } from "../app/api/session/route";

let testAccountId: number;

beforeEach(async () => {
  const db = await getDb();
  const passcodeHash = await hashPasscode("test-coach-passcode-xyz");
  const [row] = await db
    .insert(accounts)
    .values({ name: "Test Coach", role: "coach", passcodeHash })
    .returning();
  testAccountId = row.id;
});

afterEach(async () => {
  await deleteAccount(testAccountId);
});

function postSession(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/session", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

test("a valid passcode sets a session cookie for the right account", async () => {
  const res = await postSession({ passcode: "test-coach-passcode-xyz" });
  assert.equal(res.status, 200);
  const cookie = res.cookies.get(SESSION_COOKIE);
  assert.ok(cookie);
  assert.deepEqual(verifySessionToken(cookie.value), {
    accountId: testAccountId,
    role: "coach",
  });
});

test("the wrong passcode is rejected", async () => {
  const res = await postSession({ passcode: "not-the-passcode" });
  assert.equal(res.status, 401);
  assert.equal(res.cookies.get(SESSION_COOKIE), undefined);
});

test("an empty passcode is rejected", async () => {
  const res = await postSession({ passcode: "" });
  assert.equal(res.status, 401);
});
