import { getResend } from "./email-client";

export interface OnboardingEmailParams {
  to: string;
  name: string;
  passcode: string;
  referenceId: string;
  appInstallUrl: string;
  setupGuideUrl: string;
}

export type SendResult = { ok: true } | { ok: false; error: string };

const FROM_ADDRESS = "Gamma Coaching <onboarding@resend.dev>";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderOnboardingEmail({
  name,
  passcode,
  referenceId,
  appInstallUrl,
  setupGuideUrl,
}: OnboardingEmailParams) {
  const subject = "Your Gamma companion app access";

  const text = [
    `Hi ${name},`,
    "",
    "Here's everything you need to get set up:",
    "",
    `Passcode: ${passcode}`,
    `Pairing ID: ${referenceId}`,
    "",
    `1. Install the app: ${appInstallUrl}`,
    `2. Connect Health Connect / MyFitnessPal: ${setupGuideUrl}`,
    "3. Open the app, log in with your passcode, then enter your pairing ID.",
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Here's everything you need to get set up:</p>
    <p>
      <strong>Passcode:</strong> ${escapeHtml(passcode)}<br />
      <strong>Pairing ID:</strong> ${escapeHtml(referenceId)}
    </p>
    <ol>
      <li><a href="${appInstallUrl}">Install the app</a></li>
      <li><a href="${setupGuideUrl}">Connect Health Connect / MyFitnessPal</a></li>
      <li>Open the app, log in with your passcode, then enter your pairing ID.</li>
    </ol>
  `.trim();

  return { subject, text, html };
}

// Sends the one-time onboarding email a coach triggers explicitly (never
// automatic on account creation, per specs/mobile-companion-onboarding.md).
// Non-fatal when RESEND_API_KEY is missing — this is a convenience feature,
// not an auth/security gate, so it returns an error rather than throwing
// past the caller (which must not let this break account creation).
export async function sendClientOnboardingEmail(
  params: OnboardingEmailParams,
): Promise<SendResult> {
  const resend = getResend();
  if (!resend) {
    console.error("sendClientOnboardingEmail: RESEND_API_KEY is not configured");
    return { ok: false, error: "Email isn't configured (missing RESEND_API_KEY)." };
  }

  const { subject, text, html } = renderOnboardingEmail(params);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject,
    text,
    html,
  });

  if (error) {
    console.error("sendClientOnboardingEmail: Resend error", error);
    return { ok: false, error: error.message ?? "Failed to send email." };
  }

  return { ok: true };
}
