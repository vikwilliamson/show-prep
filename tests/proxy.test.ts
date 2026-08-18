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
