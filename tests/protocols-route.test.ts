import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { accounts, getDb, protocols } from "../lib/db";
import { createSessionToken, deleteAccount, hashPasscode, SESSION_COOKIE } from "../lib/auth";
import { GET } from "../app/api/protocols/route";
import { PATCH } from "../app/api/protocols/[id]/route";

const createdAccountIds: number[] = [];

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

async function makeProtocol(
  accountId: number,
  overrides: Partial<typeof protocols.$inferInsert> = {},
): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(protocols)
    .values({
      accountId,
      status: "pending",
      effectiveFrom: "2026-02-02",
      ...overrides,
    })
    .returning();
  return row.id;
}

afterEach(async () => {
  await Promise.all(createdAccountIds.map(deleteAccount));
  createdAccountIds.length = 0;
});

function getRequestWithSession(accountId: number | null, status?: string) {
  const headers: Record<string, string> = {};
  if (accountId !== null) {
    const token = createSessionToken({ accountId, role: "client" });
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  const url = status
    ? `http://localhost/api/protocols?status=${status}`
    : "http://localhost/api/protocols";
  return new NextRequest(url, { headers });
}

function patchRequestWithSession(accountId: number | null, body: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (accountId !== null) {
    const token = createSessionToken({ accountId, role: "client" });
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  return new NextRequest("http://localhost/api/protocols/1", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function ctxFor(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

test("GET requires a session", async () => {
  const res = await GET(getRequestWithSession(null));
  assert.equal(res.status, 401);
});

test("GET only lists the caller's own protocols", async () => {
  const a = await makeAccount("Protocols Route Test A");
  const b = await makeAccount("Protocols Route Test B");
  await makeProtocol(a, { notes: "A's protocol" });
  await makeProtocol(b, { notes: "B's protocol" });

  const res = await GET(getRequestWithSession(a));
  const json = await res.json();
  assert.equal(json.length, 1);
  assert.equal(json[0].notes, "A's protocol");
});

test("PATCH requires a session", async () => {
  const res = await PATCH(patchRequestWithSession(null, { action: "reject" }), ctxFor(1));
  assert.equal(res.status, 401);
});

test("PATCH 404s on another account's protocol", async () => {
  const a = await makeAccount("Protocols Route Test PATCH A");
  const b = await makeAccount("Protocols Route Test PATCH B");
  const protocolId = await makeProtocol(a);

  const res = await PATCH(
    patchRequestWithSession(b, { action: "reject" }),
    ctxFor(protocolId),
  );
  assert.equal(res.status, 404);
});

test("confirming a protocol only supersedes the same account's active protocols", async () => {
  const a = await makeAccount("Protocols Route Test Supersede A");
  const b = await makeAccount("Protocols Route Test Supersede B");
  const aActive = await makeProtocol(a, { status: "active", confirmedAt: new Date() });
  const bActive = await makeProtocol(b, { status: "active", confirmedAt: new Date() });
  const aPending = await makeProtocol(a, { status: "pending" });

  const res = await PATCH(
    patchRequestWithSession(a, { action: "confirm" }),
    ctxFor(aPending),
  );
  assert.equal(res.status, 200);

  const db = await getDb();
  const rows = await db
    .select()
    .from(protocols)
    .where(inArray(protocols.id, [aActive, bActive, aPending]));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));

  assert.equal(byId[aActive], "superseded");
  assert.equal(byId[aPending], "active");
  assert.equal(byId[bActive], "active", "another account's active protocol must not be superseded");
});
