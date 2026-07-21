import { NextResponse, type NextRequest } from "next/server";

// Basic single-user session gate. Active only when APP_PASSWORD is set:
// every route except /login, /api/session and /api/ingest/* (which has its
// own bearer-token auth) requires the session cookie.

export const SESSION_COOKIE = "sp_session";

function expectedToken(): string | null {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  // Not a cryptographic scheme — single-user app; the cookie just proves the
  // password was entered once in this browser.
  return Buffer.from(`show-prep:${password}`).toString("base64url");
}

export function proxy(req: NextRequest) {
  const expected = expectedToken();
  if (!expected) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/session") ||
    pathname.startsWith("/api/ingest/")
  ) {
    return NextResponse.next();
  }

  if (req.cookies.get(SESSION_COOKIE)?.value === expected) {
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
