import { NextResponse, type NextRequest } from "next/server";
import { accounts, getDb } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, verifyPasscode } from "@/lib/auth";

// POST { passcode } — looks up the account whose passcode matches (each
// account has its own unique passcode, so no separate username is needed)
// and sets a signed session cookie carrying { accountId, role }.
export async function POST(req: NextRequest) {
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
