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
  // x-vercel-forwarded-for over x-forwarded-for: per Vercel's docs
  // (vercel.com/docs/headers/request-headers), the latter "could be
  // overwritten if you're using a proxy on top of Vercel," while the
  // former stays accurate regardless. Vercel overwrites both at its edge
  // and never forwards a client-supplied value ("this restriction is in
  // place to prevent IP spoofing"), so on this app's plain Vercel
  // deployment (no proxy in front of it) either header is trustworthy
  // today — this just doesn't regress if a proxy/WAF gets added later.
  // Local dev/tests without either header share one "unknown" bucket,
  // which only matters off Vercel and is fine at this app's threat model.
  const header = req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-forwarded-for");
  return header?.split(",")[0]?.trim() || "unknown";
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
