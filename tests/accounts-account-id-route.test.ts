import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { accounts, getDb, weightEntries } from "../lib/db";
import { createSessionToken, deleteAccount, generatePasscode, hashPasscode, SESSION_COOKIE } from "../lib/auth";
import { PATCH, DELETE } from "../app/api/accounts/[accountId]/route";

const createdAccountIds: number[] = [];
afterEach(async () => {
  await Promise.all(createdAccountIds.map(deleteAccount));
  createdAccountIds.length = 0;
});

async function makeClient(overrides: { name?: string; email?: string | null } = {}) {
  const passcode = generatePasscode();
  const passcodeHash = await hashPasscode(passcode);
  const db = await getDb();
  const [row] = await db
    .insert(accounts)
    .values({
      name: overrides.name ?? "Edit Target Client",
      email: overrides.email === undefined ? "client@example.com" : overrides.email,
      role: "client",
      passcodeHash,
    })
    .returning();
  createdAccountIds.push(row.id);
  return row;
}

function requestAsRole(
  role: "coach" | "client" | null,
  accountId: number,
  method: "PATCH" | "DELETE",
  body?: unknown,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (role) {
    const token = createSessionToken({ accountId: 1, role });
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  return new NextRequest(`http://localhost/api/accounts/${accountId}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(accountId: number) {
  return { params: Promise.resolve({ accountId: String(accountId) }) };
}

// PATCH

test("PATCH /api/accounts/[accountId] 401s with no session", async () => {
  const client = await makeClient();
  const res = await PATCH(requestAsRole(null, client.id, "PATCH", { name: "New Name" }), ctx(client.id));
  assert.equal(res.status, 401);
});

test("PATCH /api/accounts/[accountId] 403s a client session", async () => {
  const client = await makeClient();
  const res = await PATCH(
    requestAsRole("client", client.id, "PATCH", { name: "New Name" }),
    ctx(client.id),
  );
  assert.equal(res.status, 403);
});

test("PATCH /api/accounts/[accountId] 404s a nonexistent client account", async () => {
  const res = await PATCH(requestAsRole("coach", -1, "PATCH", { name: "New Name" }), ctx(-1));
  assert.equal(res.status, 404);
});

test("PATCH /api/accounts/[accountId] 404s a coach account (not a client)", async () => {
  const passcodeHash = await hashPasscode("coach-passcode");
  const db = await getDb();
  const [coach] = await db
    .insert(accounts)
    .values({ name: "Some Coach", role: "coach", passcodeHash })
    .returning();
  try {
    const res = await PATCH(
      requestAsRole("coach", coach.id, "PATCH", { name: "New Name" }),
      ctx(coach.id),
    );
    assert.equal(res.status, 404);
  } finally {
    await deleteAccount(coach.id);
  }
});

test("PATCH /api/accounts/[accountId] 422s an empty body", async () => {
  const client = await makeClient();
  const res = await PATCH(requestAsRole("coach", client.id, "PATCH", {}), ctx(client.id));
  assert.equal(res.status, 422);
});

test("PATCH /api/accounts/[accountId] 422s a malformed body before looking up the account", async () => {
  const res = await PATCH(requestAsRole("coach", -1, "PATCH", {}), ctx(-1));
  assert.equal(res.status, 422);
});

test("PATCH /api/accounts/[accountId] 422s a malformed email", async () => {
  const client = await makeClient();
  const res = await PATCH(
    requestAsRole("coach", client.id, "PATCH", { email: "not-an-email" }),
    ctx(client.id),
  );
  assert.equal(res.status, 422);
});

test("PATCH /api/accounts/[accountId] updates name only, leaving email untouched", async () => {
  const client = await makeClient({ email: "keep-me@example.com" });
  const res = await PATCH(
    requestAsRole("coach", client.id, "PATCH", { name: "Renamed Client" }),
    ctx(client.id),
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.account.name, "Renamed Client");
  assert.equal(json.account.email, "keep-me@example.com");
  assert.equal(json.account.passcodeHash, undefined);
});

test("PATCH /api/accounts/[accountId] updates email, trimmed and lowercased", async () => {
  const client = await makeClient();
  const res = await PATCH(
    requestAsRole("coach", client.id, "PATCH", { email: "  New@Example.com  " }),
    ctx(client.id),
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.account.email, "new@example.com");
});

test("PATCH /api/accounts/[accountId] can clear email by setting it null", async () => {
  const client = await makeClient({ email: "gone@example.com" });
  const res = await PATCH(requestAsRole("coach", client.id, "PATCH", { email: null }), ctx(client.id));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.account.email, null);
});

test("PATCH /api/accounts/[accountId] persists the update", async () => {
  const client = await makeClient();
  await PATCH(requestAsRole("coach", client.id, "PATCH", { name: "Persisted Name" }), ctx(client.id));
  const db = await getDb();
  const [row] = await db.select().from(accounts).where(eq(accounts.id, client.id));
  assert.equal(row.name, "Persisted Name");
});

// DELETE

test("DELETE /api/accounts/[accountId] 401s with no session", async () => {
  const client = await makeClient();
  const res = await DELETE(requestAsRole(null, client.id, "DELETE"), ctx(client.id));
  assert.equal(res.status, 401);
  const db = await getDb();
  const [row] = await db.select().from(accounts).where(eq(accounts.id, client.id));
  assert.ok(row);
});

test("DELETE /api/accounts/[accountId] 403s a client session", async () => {
  const client = await makeClient();
  const res = await DELETE(requestAsRole("client", client.id, "DELETE"), ctx(client.id));
  assert.equal(res.status, 403);
  const db = await getDb();
  const [row] = await db.select().from(accounts).where(eq(accounts.id, client.id));
  assert.ok(row);
});

test("DELETE /api/accounts/[accountId] 404s a nonexistent client account", async () => {
  const res = await DELETE(requestAsRole("coach", -1, "DELETE"), ctx(-1));
  assert.equal(res.status, 404);
});

test("DELETE /api/accounts/[accountId] 404s a coach account (not a client)", async () => {
  const passcodeHash = await hashPasscode("coach-passcode-2");
  const db = await getDb();
  const [coach] = await db
    .insert(accounts)
    .values({ name: "Another Coach", role: "coach", passcodeHash })
    .returning();
  try {
    const res = await DELETE(requestAsRole("coach", coach.id, "DELETE"), ctx(coach.id));
    assert.equal(res.status, 404);
  } finally {
    await deleteAccount(coach.id);
  }
});

test("DELETE /api/accounts/[accountId] deletes the client account", async () => {
  const client = await makeClient();
  const res = await DELETE(requestAsRole("coach", client.id, "DELETE"), ctx(client.id));
  assert.equal(res.status, 200);

  const db = await getDb();
  const [row] = await db.select().from(accounts).where(eq(accounts.id, client.id));
  assert.equal(row, undefined);
  createdAccountIds.splice(createdAccountIds.indexOf(client.id), 1);
});

test("DELETE /api/accounts/[accountId] cascades to the client's other data", async () => {
  const client = await makeClient();
  const db = await getDb();
  await db.insert(weightEntries).values({
    accountId: client.id,
    measuredAt: new Date("2026-01-05T14:00:00Z"),
    localDate: "2026-01-05",
    weightLbs: 180,
  });

  const res = await DELETE(requestAsRole("coach", client.id, "DELETE"), ctx(client.id));
  assert.equal(res.status, 200);

  const remaining = await db
    .select()
    .from(weightEntries)
    .where(eq(weightEntries.accountId, client.id));
  assert.equal(remaining.length, 0);
  createdAccountIds.splice(createdAccountIds.indexOf(client.id), 1);
});
