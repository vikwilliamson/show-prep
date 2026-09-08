import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getClientAccount, requireCoach, SESSION_COOKIE, verifyPasscode } from "@/lib/auth";
import { sendClientOnboardingEmail } from "@/lib/email";
import { env } from "@/lib/env";

const postSchema = z.object({ passcode: z.string().trim().min(1) });

// POST — coach-only. Fires the one-time onboarding email (explicit action,
// never automatic on account creation — see specs/mobile-companion-
// onboarding.md) for a real client account. The plaintext passcode is never
// persisted (app/api/accounts/route.ts), so the caller's own client-side
// copy of it — captured right after account creation — is the only source;
// this route re-verifies it against the stored hash before sending, so a
// stale/mistyped passcode can't go out in an email that looks authoritative.
export async function POST(req: NextRequest, ctx: { params: Promise<{ accountId: string }> }) {
  const authError = requireCoach(req.cookies.get(SESSION_COOKIE)?.value);
  if (authError) return authError;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  const { accountId } = await ctx.params;
  const client = await getClientAccount(Number(accountId));
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!client.email) {
    return NextResponse.json(
      { error: "This client has no email address on file." },
      { status: 422 },
    );
  }

  const passcodeOk = await verifyPasscode(parsed.data.passcode, client.passcodeHash);
  if (!passcodeOk) {
    return NextResponse.json({ error: "Passcode doesn't match this account." }, { status: 422 });
  }

  const result = await sendClientOnboardingEmail({
    to: client.email,
    name: client.name,
    passcode: parsed.data.passcode,
    referenceId: client.referenceId,
    appInstallUrl: env.appInstallUrl,
    setupGuideUrl: env.setupGuideUrl,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
