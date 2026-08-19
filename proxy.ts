import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAccount, SESSION_COOKIE } from "@/lib/auth";
import { env } from "@/lib/env";

// Per-account session gate. Active only when SESSION_SECRET is configured
// (unset in local dev by default): every route except /login, /api/session
// and /api/ingest/* (which has its own bearer-token auth) requires a valid
// session cookie. This only reads the cookie (optimistic check, no DB call)
// since Proxy runs on every route, including prefetches — see
// node_modules/next/dist/docs/01-app/02-guides/authentication.md. This only
// gates "is there a valid session" — individual route handlers use
// lib/auth.ts's requireAccount()/getCurrentAccount() to get the actual
// accountId back out of the cookie and scope their own queries with it (see
// specs/client-accounts.md's Follow-up checklist).

export function proxy(req: NextRequest) {
  if (!env.sessionSecret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/session") ||
    pathname.startsWith("/api/ingest/")
  ) {
    return NextResponse.next();
  }

  if (getCurrentAccount(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|svg|ico|jpg|webp)$).*)"],
};
