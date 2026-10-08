// @vitest-environment jsdom
import assert from "node:assert/strict";
import { render, screen } from "@testing-library/react";
import { afterEach, test, vi } from "vitest";
import { accounts, getDb, settings } from "../lib/db";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
import { eq } from "drizzle-orm";
import { getSettings } from "../lib/stats";
import { createAccountTracker } from "./helpers";

let sessionCookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && sessionCookieValue ? { value: sessionCookieValue } : undefined,
  }),
}));

// redirect()/notFound() throw Next-internal control-flow signals — mock them
// so they're plain assertions. useRouter is for the ClientActions child.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const ClientDashboard = (await import("../app/clients/[accountId]/page")).default;

const { makeAccount, cleanup } = createAccountTracker();
afterEach(cleanup);
afterEach(() => {
  sessionCookieValue = undefined;
});

const paramsFor = (id: number) => ({ params: Promise.resolve({ accountId: String(id) }) });

test("redirects to /login with no session and to / for a client session", async () => {
  await assert.rejects(() => ClientDashboard(paramsFor(1)), /REDIRECT:\/login/);

  sessionCookieValue = createSessionToken({ accountId: 1, role: "client" });
  await assert.rejects(() => ClientDashboard(paramsFor(1)), /REDIRECT:\//);
});

test("404s for an account that isn't a client", async () => {
  sessionCookieValue = createSessionToken({ accountId: 1, role: "coach" });
  await assert.rejects(() => ClientDashboard(paramsFor(999999)), /NOT_FOUND/);
});

test("shows the client's saved settings read-only — no form fields until Edit", async () => {
  const { id } = await makeAccount("Client Page Readonly Test");
  const db = await getDb();
  await db.update(accounts).set({ email: "readonly@example.com" }).where(eq(accounts.id, id));
  const current = await getSettings(id);
  await db
    .update(settings)
    .set({ targetDate: "2027-03-01", targetCalories: 2150, targetWeightLbs: 168 })
    .where(eq(settings.id, current.id));

  sessionCookieValue = createSessionToken({ accountId: 1, role: "coach" });
  render(await ClientDashboard(paramsFor(id)));

  assert.ok(screen.getByRole("button", { name: "Edit" }));
  assert.ok(screen.getByText("readonly@example.com"));
  assert.ok(screen.getByText(/2150 kcal/));
  assert.ok(screen.getByText("168 lbs"));
  assert.equal(screen.queryByRole("textbox"), null);
  assert.equal(screen.queryByLabelText("Target date"), null);
  assert.equal(screen.queryByRole("button", { name: /save/i }), null);
});

test("renders for a brand-new client with no weekly_targets row yet (no first-access insert race)", async () => {
  const { id } = await makeAccount("Client Page Fresh Test");
  sessionCookieValue = createSessionToken({ accountId: 1, role: "coach" });
  render(await ClientDashboard(paramsFor(id)));
  assert.ok(screen.getByText(/3000 ml water/));
});
