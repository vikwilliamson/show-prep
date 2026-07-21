import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

// POST { password } — sets the session cookie when it matches APP_PASSWORD.
export async function POST(req: NextRequest) {
  if (!env.appPassword) {
    return NextResponse.json({ ok: true, note: "No password configured." });
  }
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (password !== env.appPassword) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const token = Buffer.from(`show-prep:${env.appPassword}`).toString("base64url");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sp_session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return res;
}
