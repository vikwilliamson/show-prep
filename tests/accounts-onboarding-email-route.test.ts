import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken, deleteAccount, generatePasscode, hashPasscode, SESSION_COOKIE } from "../lib/auth";
import { accounts, getDb } from "../lib/db";

// POST /api/accounts/[accountId]/onboarding-email calls
// sendClientOnboardingEmail() — mock it at the module seam (same approach
// tests/email.test.ts uses one layer down) so this suite only asserts
// auth/scoping/validation, not email delivery.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("../lib/email", () => ({
  sendClientOnboardingEmail: sendMock,
}));

const { POST } = await import("../app/api/accounts/[accountId]/onboarding-email/route");

const createdAccountIds: number[] = [];
afterEach(async () => {
  await Promise.all(createdAccountIds.map(deleteAccount));
  createdAccountIds.length = 0;
  sendMock.mockReset();
});

async function makeClient(overrides: { email?: string | null } = {}) {
  const passcode = generatePasscode();
  const passcodeHash = await hashPasscode(passcode);
  const db = await getDb();
  const [row] = await db
    .insert(accounts)
    .values({
      name: "Onboarding Email Client",
      email: overrides.email === undefined ? "client@example.com" : overrides.email,
      role: "client",
      passcodeHash,
    })
    .returning();
  createdAccountIds.push(row.id);
  return { id: row.id, referenceId: row.referenceId, passcode };
}

function requestAsRole(role: "coach" | "client" | null, accountId: number, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (role) {
    const token = createSessionToken({ accountId: 1, role });
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  return new NextRequest(`http://localhost/api/accounts/${accountId}/onboarding-email`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function ctx(accountId: number) {
  return { params: Promise.resolve({ accountId: String(accountId) }) };
}

test("401s with no session", async () => {
  const client = await makeClient();
  const res = await POST(requestAsRole(null, client.id, { passcode: client.passcode }), ctx(client.id));
  assert.equal(res.status, 401);
  assert.equal(sendMock.mock.calls.length, 0);
});

test("403s a client session", async () => {
  const client = await makeClient();
  const res = await POST(
    requestAsRole("client", client.id, { passcode: client.passcode }),
    ctx(client.id),
  );
  assert.equal(res.status, 403);
  assert.equal(sendMock.mock.calls.length, 0);
});

test("404s a nonexistent client account", async () => {
  const res = await POST(requestAsRole("coach", -1, { passcode: "whatever" }), ctx(-1));
  assert.equal(res.status, 404);
  assert.equal(sendMock.mock.calls.length, 0);
});

test("422s a malformed body before looking up the account — a bad body on a nonexistent accountId still 422s, not 404", async () => {
  const res = await POST(requestAsRole("coach", -1, {}), ctx(-1));
  assert.equal(res.status, 422);
  assert.equal(sendMock.mock.calls.length, 0);
});

test("404s a coach account (not a client)", async () => {
  const passcodeHash = await hashPasscode("coach-passcode");
  const db = await getDb();
  const [coach] = await db
    .insert(accounts)
    .values({ name: "Some Coach", role: "coach", passcodeHash })
    .returning();
  try {
    const res = await POST(
      requestAsRole("coach", coach.id, { passcode: "coach-passcode" }),
      ctx(coach.id),
    );
    assert.equal(res.status, 404);
  } finally {
    await deleteAccount(coach.id);
  }
});

test("422s when the client has no email on file", async () => {
  const client = await makeClient({ email: null });
  const res = await POST(
    requestAsRole("coach", client.id, { passcode: client.passcode }),
    ctx(client.id),
  );
  assert.equal(res.status, 422);
  assert.equal(sendMock.mock.calls.length, 0);
});

test("422s when the passcode doesn't match the account", async () => {
  const client = await makeClient();
  const res = await POST(
    requestAsRole("coach", client.id, { passcode: "wrong-passcode" }),
    ctx(client.id),
  );
  assert.equal(res.status, 422);
  assert.equal(sendMock.mock.calls.length, 0);
});

test("sends the onboarding email with the client's real passcode and pairing ID, coach-only", async () => {
  const client = await makeClient({ email: "real-client@example.com" });
  sendMock.mockResolvedValueOnce({ ok: true });

  const res = await POST(
    requestAsRole("coach", client.id, { passcode: client.passcode }),
    ctx(client.id),
  );

  assert.equal(res.status, 200);
  assert.equal(sendMock.mock.calls.length, 1);
  const [sentParams] = sendMock.mock.calls[0];
  assert.equal(sentParams.to, "real-client@example.com");
  assert.equal(sentParams.passcode, client.passcode);
  assert.equal(sentParams.referenceId, client.referenceId);
});

test("502s and surfaces the error when sendClientOnboardingEmail fails (e.g. missing RESEND_API_KEY)", async () => {
  const client = await makeClient();
  sendMock.mockResolvedValueOnce({ ok: false, error: "Email isn't configured (missing RESEND_API_KEY)." });

  const res = await POST(
    requestAsRole("coach", client.id, { passcode: client.passcode }),
    ctx(client.id),
  );

  assert.equal(res.status, 502);
  const json = await res.json();
  assert.match(json.error, /RESEND_API_KEY/);
});
