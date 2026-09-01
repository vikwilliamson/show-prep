import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { accounts, getDb } from "../lib/db";
import { createSessionToken, deleteAccount, hashPasscode, SESSION_COOKIE } from "../lib/auth";
import { GET } from "../app/api/clients/route";
import { createAccountTracker } from "./helpers";

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

function requestWithSession(role: "coach" | "client" | null, accountId = 1) {
  const headers: Record<string, string> = {};
  if (role) {
    const token = createSessionToken({ accountId, role });
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  return new NextRequest("http://localhost/api/clients", { headers });
}

test("GET /api/clients 401s with no session", async () => {
  const res = await GET(requestWithSession(null));
  assert.equal(res.status, 401);
});

test("GET /api/clients 403s a client session", async () => {
  const res = await GET(requestWithSession("client"));
  assert.equal(res.status, 403);
});

test("GET /api/clients lists client accounts, never coach accounts", async () => {
  const { id: clientA } = await makeAccount("Clients Route Test Client A");
  const { id: clientB } = await makeAccount("Clients Route Test Client B");

  const db = await getDb();
  const passcodeHash = await hashPasscode("clients-route-extra-coach");
  const [extraCoach] = await db
    .insert(accounts)
    .values({ name: "Clients Route Test Extra Coach", role: "coach", passcodeHash })
    .returning();

  try {
    const res = await GET(requestWithSession("coach"));
    assert.equal(res.status, 200);
    const json = await res.json();
    const ids = json.map((c: { id: number }) => c.id);
    assert.ok(ids.includes(clientA));
    assert.ok(ids.includes(clientB));
    assert.ok(!ids.includes(extraCoach.id));
  } finally {
    await deleteAccount(extraCoach.id);
  }
});
