import { Resend } from "resend";
import { env } from "./env";

// Zero-arg client, mirroring lib/ai/client.ts's getAnthropic(): a lazily-
// initialized singleton, mocked at this seam in tests so lib/email.ts's
// real templating/formatting logic still runs. Returns null when
// RESEND_API_KEY is unset — non-fatal, see lib/email.ts.
const globalForEmail = globalThis as unknown as { __resend?: Resend };

export function getResend(): Resend | null {
  if (!env.resendApiKey) return null;
  if (!globalForEmail.__resend) {
    globalForEmail.__resend = new Resend(env.resendApiKey);
  }
  return globalForEmail.__resend;
}
