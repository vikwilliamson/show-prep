import assert from "node:assert/strict";
import { test } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "../lib/auth";
import { proxy } from "../proxy";

function requestTo(pathname: string, cookieValue?: string) {
  const headers = cookieValue ? { cookie: `${SESSION_COOKIE}=${cookieValue}` } : undefined;
  return new NextRequest(`http://localhost${pathname}`, { headers });
}

test("public paths pass through with no session", () => {
  for (const pathname of ["/login", "/api/session", "/api/ingest/weight"]) {
    const res = proxy(requestTo(pathname));
    assert.equal(res.status, 200); // NextResponse.next() reports as a plain 200 passthrough
  }
});

test("the mobile companion's bearer-authed dashboard route passes through with no session cookie", () => {
  // The companion app has no session cookie; /api/mobile/dashboard authenticates
  // itself with the ingest bearer token + referenceId (specs/mobile-dashboard-view.md).
  const res = proxy(requestTo("/api/mobile/dashboard"));
  assert.equal(res.status, 200);
});

test("paths that merely resemble the public prefixes stay gated", () => {
  for (const pathname of ["/api/mobile", "/api/mobiles/dashboard", "/api/ingest", "/api/mobile-admin"]) {
    const res = proxy(requestTo(pathname));
    assert.equal(res.status, 401, `${pathname} should 401 with no session`);
  }
});

test("a protected page redirects to /login with no session", () => {
  const res = proxy(requestTo("/"));
  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get("location")!).pathname, "/login");
});

test("a protected API route 401s with no session", () => {
  const res = proxy(requestTo("/api/settings"));
  assert.equal(res.status, 401);
});

test("a valid session cookie passes through to a protected page", () => {
  const token = createSessionToken({ accountId: 1, role: "coach" });
  const res = proxy(requestTo("/", token));
  assert.equal(res.status, 200);
});

test("DELETE /api/session (logout) passes through even with no valid session", () => {
  const req = new NextRequest("http://localhost/api/session", { method: "DELETE" });
  assert.equal(proxy(req).status, 200);
});
