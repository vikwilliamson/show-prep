import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import { NextRequest } from "next/server";
import { getDb, accounts } from "../lib/db";
import { deleteAccount, hashPasscode, SESSION_COOKIE, verifySessionToken } from "../lib/auth";
import { resetRateLimit } from "../lib/rate-limit";
import { LOGIN_RATE_LIMIT, POST } from "../app/api/session/route";

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
  resetRateLimit();
});

function postSession(body: unknown, ip?: string) {
  return POST(
    new NextRequest("http://localhost/api/session", {
      method: "POST",
      body: JSON.stringify(body),
      headers: ip ? { "x-forwarded-for": ip } : undefined,
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

test("repeated wrong-passcode attempts from one IP are rate-limited, blocking even a correct passcode once tripped", async () => {
  const ip = "203.0.113.7";
  for (let i = 0; i < LOGIN_RATE_LIMIT.max; i++) {
    const res = await postSession({ passcode: "not-the-passcode" }, ip);
    assert.equal(res.status, 401);
  }

  // The limit is now hit — even the *correct* passcode gets rejected before
  // the account scan runs, proving the guard sits ahead of the expensive
  // per-row scrypt work rather than merely tolerating it.
  const res = await postSession({ passcode: "test-coach-passcode-xyz" }, ip);
  assert.equal(res.status, 429);
  assert.equal(res.cookies.get(SESSION_COOKIE), undefined);
});

test("a different IP is unaffected by another IP's rate limit", async () => {
  const tripped = "203.0.113.8";
  const other = "203.0.113.9";
  for (let i = 0; i < LOGIN_RATE_LIMIT.max; i++) {
    await postSession({ passcode: "not-the-passcode" }, tripped);
  }
  assert.equal((await postSession({ passcode: "not-the-passcode" }, tripped)).status, 429);

  const res = await postSession({ passcode: "test-coach-passcode-xyz" }, other);
  assert.equal(res.status, 200);
});
