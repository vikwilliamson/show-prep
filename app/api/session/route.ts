import { NextResponse, type NextRequest } from "next/server";
import { accounts, getDb } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, verifyPasscode } from "@/lib/auth";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

// Bounds the per-row scrypt scan below (VIK-127): without this, an
// unauthenticated caller can force a full scrypt hash per account on every
// POST, and cost grows linearly with account count. 10 attempts / 5 min per
// IP is generous for a mistyped passcode but caps worst-case cost at a
// small constant multiple of the account count instead of unbounded.
export const LOGIN_RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 10 };

function clientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for; local dev/tests without it share one
  // bucket, which is fine at this app's threat model.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// POST { passcode } — looks up the account whose passcode matches (each
// account has its own unique passcode, so no separate username is needed)
// and sets a signed session cookie carrying { accountId, role }.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!checkRateLimit(ip, LOGIN_RATE_LIMIT)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { passcode } = await req.json().catch(() => ({ passcode: "" }));
  if (!passcode) {
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }

  const db = await getDb();
  const rows = await db.select().from(accounts);
  let match: (typeof rows)[number] | undefined;
  for (const row of rows) {
    if (await verifyPasscode(passcode, row.passcodeHash)) {
      match = row;
      break;
    }
  }

  if (!match) {
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }

  // A correct passcode clears this IP's bucket so a household sharing one
  // IP doesn't get punished for someone else's earlier typos.
  resetRateLimit(ip);
  const token = createSessionToken({ accountId: match.id, role: match.role });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return res;
}
