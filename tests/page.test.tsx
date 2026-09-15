// @vitest-environment jsdom
import assert from "node:assert/strict";
import { render, screen } from "@testing-library/react";
import { afterEach, test, vi } from "vitest";
import { accounts, coachBriefs, getDb } from "../lib/db";
import { createSessionToken, deleteAccount, hashPasscode, SESSION_COOKIE } from "../lib/auth";
import { getSettings } from "../lib/stats";
import { mondayOf, todayLocal } from "../lib/dates";
import { createAccountTracker } from "./helpers";

// app/page.tsx reads the session via next/headers' cookies() — mock it to
// hand back whichever session token the test sets up, the same way a real
// request's cookie jar would.
let sessionCookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && sessionCookieValue ? { value: sessionCookieValue } : undefined,
  }),
}));

// next/navigation's redirect() throws internally (Next's own control-flow
// signal) — mock it so a coach-role redirect is observable as a plain
// assertion instead of a framework-internal exception shape.
let redirectedTo: string | undefined;
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectedTo = url;
    throw new Error(`REDIRECT:${url}`);
  },
}));

const Dashboard = (await import("../app/page")).default;

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);
afterEach(() => {
  sessionCookieValue = undefined;
  redirectedTo = undefined;
});

test("coach session hitting / redirects to /clients, not its own client-shaped dashboard", async () => {
  const passcodeHash = await hashPasscode("dashboard-page-test-coach");
  const db = await getDb();
  const [coach] = await db
    .insert(accounts)
    .values({ name: "Dashboard Page Test Coach", role: "coach", passcodeHash })
    .returning();

  try {
    sessionCookieValue = createSessionToken({ accountId: coach.id, role: "coach" });
    await assert.rejects(() => Dashboard(), /REDIRECT:\/clients/);
    assert.equal(redirectedTo, "/clients");
  } finally {
    await deleteAccount(coach.id);
  }
});

test("client session hitting / is unaffected — still renders the dashboard", async () => {
  const { id: clientId } = await makeAccount("Dashboard Page Test Unaffected Client");
  sessionCookieValue = createSessionToken({ accountId: clientId, role: "client" });

  const ui = await Dashboard();
  assert.equal(redirectedTo, undefined);
  render(ui);
});

test("dashboard never renders an unapproved coach-brief draft's content", async () => {
  const { id: clientId } = await makeAccount("Dashboard Page Test Client");
  sessionCookieValue = createSessionToken({ accountId: clientId, role: "client" });

  const settings = await getSettings(clientId);
  const weekStart = mondayOf(todayLocal(settings.timezone));

  const db = await getDb();
  await db.insert(coachBriefs).values({
    accountId: clientId,
    weekStart,
    status: "draft",
    content: "SECRET UNAPPROVED DRAFT CONTENT",
  });

  const ui = await Dashboard();
  render(ui);

  assert.equal(
    screen.queryByText(/SECRET UNAPPROVED DRAFT CONTENT/),
    null,
    "draft brief content must never reach the rendered dashboard",
  );
});
