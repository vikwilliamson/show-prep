import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb, protocols } from "../lib/db";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
import { GET } from "../app/api/protocols/route";
import { PATCH } from "../app/api/protocols/[id]/route";
import { createAccountTracker } from "./helpers";

function coachRequestFor(clientId: number) {
  const token = createSessionToken({ accountId: 999, role: "coach" });
  return new NextRequest(`http://localhost/api/protocols?accountId=${clientId}`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);

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
  const { id: a } = await makeAccount("Protocols Route Test A");
  const { id: b } = await makeAccount("Protocols Route Test B");
  await makeProtocol(a, { notes: "A's protocol" });
  await makeProtocol(b, { notes: "B's protocol" });

  const res = await GET(getRequestWithSession(a));
  const json = await res.json();
  assert.equal(json.length, 1);
  assert.equal(json[0].notes, "A's protocol");
});

test("GET ?accountId= lets a coach view a real client's protocols", async () => {
  const { id: clientId } = await makeAccount("Protocols Route Test Coach Client");
  await makeProtocol(clientId, { notes: "client's protocol" });

  const res = await GET(coachRequestFor(clientId));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.length, 1);
  assert.equal(json[0].notes, "client's protocol");
});

test("GET ?accountId= 403s a client requesting another account's id", async () => {
  const { id: a } = await makeAccount("Protocols Route Test Client Requester");
  const { id: b } = await makeAccount("Protocols Route Test Client Other");
  await makeProtocol(b, { notes: "not yours" });

  const token = createSessionToken({ accountId: a, role: "client" });
  const res = await GET(
    new NextRequest(`http://localhost/api/protocols?accountId=${b}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    }),
  );
  assert.equal(res.status, 403);
});

test("PATCH requires a session", async () => {
  const res = await PATCH(patchRequestWithSession(null, { action: "reject" }), ctxFor(1));
  assert.equal(res.status, 401);
});

test("PATCH 404s on another account's protocol", async () => {
  const { id: a } = await makeAccount("Protocols Route Test PATCH A");
  const { id: b } = await makeAccount("Protocols Route Test PATCH B");
  const protocolId = await makeProtocol(a);

  const res = await PATCH(
    patchRequestWithSession(b, { action: "reject" }),
    ctxFor(protocolId),
  );
  assert.equal(res.status, 404);
});

function coachPatchRequest(coachId: number, body: unknown) {
  const token = createSessionToken({ accountId: coachId, role: "coach" });
  return new NextRequest("http://localhost/api/protocols/1", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
    body: JSON.stringify(body),
  });
}

async function statusesById(ids: number[]) {
  const db = await getDb();
  const rows = await db.select().from(protocols).where(inArray(protocols.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

test("PATCH confirm lets a coach confirm a client's pending protocol, superseding only that client's active one", async () => {
  const { id: coach } = await makeAccount("Protocols Route Test Coach Confirm", { role: "coach" });
  const { id: client } = await makeAccount("Protocols Route Test Coach Confirm Client");
  const { id: otherClient } = await makeAccount("Protocols Route Test Coach Confirm Other Client");
  const clientActive = await makeProtocol(client, { status: "active", confirmedAt: new Date() });
  const clientPending = await makeProtocol(client, { status: "pending" });
  const coachActive = await makeProtocol(coach, { status: "active", confirmedAt: new Date() });
  const otherActive = await makeProtocol(otherClient, { status: "active", confirmedAt: new Date() });

  const res = await PATCH(
    coachPatchRequest(coach, { action: "confirm", calories: 2100 }),
    ctxFor(clientPending),
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.accountId, client);
  assert.equal(json.calories, 2100);

  const byId = await statusesById([clientActive, clientPending, coachActive, otherActive]);
  assert.equal(byId[clientPending], "active");
  assert.equal(byId[clientActive], "superseded", "the client's previous active protocol is superseded");
  assert.equal(byId[coachActive], "active", "the coach's own active protocol must not be superseded");
  assert.equal(byId[otherActive], "active", "another client's active protocol must not be superseded");
});

test("PATCH reject lets a coach reject a client's pending protocol", async () => {
  const { id: coach } = await makeAccount("Protocols Route Test Coach Reject", { role: "coach" });
  const { id: client } = await makeAccount("Protocols Route Test Coach Reject Client");
  const clientPending = await makeProtocol(client, { status: "pending" });

  const res = await PATCH(coachPatchRequest(coach, { action: "reject" }), ctxFor(clientPending));
  assert.equal(res.status, 200);
  assert.equal((await statusesById([clientPending]))[clientPending], "rejected");
});

test("PATCH reactivate lets a coach reactivate a client's superseded protocol", async () => {
  const { id: coach } = await makeAccount("Protocols Route Test Coach Reactivate", { role: "coach" });
  const { id: client } = await makeAccount("Protocols Route Test Coach Reactivate Client");
  const clientActive = await makeProtocol(client, { status: "active", confirmedAt: new Date() });
  const clientOld = await makeProtocol(client, { status: "superseded" });

  const res = await PATCH(coachPatchRequest(coach, { action: "reactivate" }), ctxFor(clientOld));
  assert.equal(res.status, 200);

  const byId = await statusesById([clientActive, clientOld]);
  assert.equal(byId[clientOld], "active");
  assert.equal(byId[clientActive], "superseded");
});

test("PATCH 404s when a coach targets a protocol owned by another coach (not a client)", async () => {
  const { id: coach } = await makeAccount("Protocols Route Test Coach Boundary", { role: "coach" });
  const { id: otherCoach } = await makeAccount("Protocols Route Test Other Coach", { role: "coach" });
  const otherCoachPending = await makeProtocol(otherCoach, { status: "pending" });

  const res = await PATCH(
    coachPatchRequest(coach, { action: "confirm" }),
    ctxFor(otherCoachPending),
  );
  assert.equal(res.status, 404);
  assert.equal((await statusesById([otherCoachPending]))[otherCoachPending], "pending");
});

test("PATCH 404s for a nonexistent protocol id", async () => {
  const { id: coach } = await makeAccount("Protocols Route Test Coach Missing", { role: "coach" });
  const res = await PATCH(coachPatchRequest(coach, { action: "reject" }), ctxFor(2_000_000_000));
  assert.equal(res.status, 404);
});

test("PATCH still lets a coach confirm their own protocol", async () => {
  const { id: coach } = await makeAccount("Protocols Route Test Coach Own", { role: "coach" });
  const coachActive = await makeProtocol(coach, { status: "active", confirmedAt: new Date() });
  const coachPending = await makeProtocol(coach, { status: "pending" });

  const res = await PATCH(coachPatchRequest(coach, { action: "confirm" }), ctxFor(coachPending));
  assert.equal(res.status, 200);

  const byId = await statusesById([coachActive, coachPending]);
  assert.equal(byId[coachPending], "active");
  assert.equal(byId[coachActive], "superseded");
});

test("confirming a protocol only supersedes the same account's active protocols", async () => {
  const { id: a } = await makeAccount("Protocols Route Test Supersede A");
  const { id: b } = await makeAccount("Protocols Route Test Supersede B");
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
