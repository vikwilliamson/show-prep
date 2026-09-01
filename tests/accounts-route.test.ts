import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { accounts, getDb } from "../lib/db";
import { createSessionToken, deleteAccount, SESSION_COOKIE, verifyPasscode } from "../lib/auth";
import { POST as postAccount } from "../app/api/accounts/route";
import { POST as postSession } from "../app/api/session/route";

const createdAccountIds: number[] = [];
afterEach(async () => {
  await Promise.all(createdAccountIds.map(deleteAccount));
  createdAccountIds.length = 0;
});

function requestAsRole(role: "coach" | "client" | null, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (role) {
    const token = createSessionToken({ accountId: 1, role });
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  return new NextRequest("http://localhost/api/accounts", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

test("POST /api/accounts 401s with no session", async () => {
  const res = await postAccount(requestAsRole(null, { name: "New Client" }));
  assert.equal(res.status, 401);
});

test("POST /api/accounts 403s a client session", async () => {
  const res = await postAccount(requestAsRole("client", { name: "New Client" }));
  assert.equal(res.status, 403);
});

test("POST /api/accounts creates a client account with a hashed passcode a coach can see once", async () => {
  const res = await postAccount(requestAsRole("coach", { name: "New Client" }));
  assert.equal(res.status, 201);
  const json = await res.json();
  createdAccountIds.push(json.account.id);

  assert.equal(json.account.name, "New Client");
  assert.equal(json.account.role, "client");
  assert.equal(json.account.passcodeHash, undefined);
  assert.equal(typeof json.passcode, "string");
  assert.ok(json.passcode.length > 0);

  const db = await getDb();
  const [row] = await db.select().from(accounts).where(eq(accounts.id, json.account.id));
  assert.equal(await verifyPasscode(json.passcode, row.passcodeHash), true);
});

test("POST /api/accounts rejects a missing name", async () => {
  const res = await postAccount(requestAsRole("coach", {}));
  assert.equal(res.status, 422);
});

test("the returned passcode logs the new client in via /api/session", async () => {
  const createRes = await postAccount(requestAsRole("coach", { name: "Login Round-Trip Client" }));
  const created = await createRes.json();
  createdAccountIds.push(created.account.id);

  const sessionRes = await postSession(
    new NextRequest("http://localhost/api/session", {
      method: "POST",
      body: JSON.stringify({ passcode: created.passcode }),
    }),
  );
  assert.equal(sessionRes.status, 200);
  const cookie = sessionRes.cookies.get(SESSION_COOKIE);
  assert.ok(cookie);
});
