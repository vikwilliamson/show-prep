import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

// sendClientOnboardingEmail() calls resend.emails.send() — mock at that seam
// (lib/email-client.ts's getResend(), mirroring lib/ai/client.ts's
// getAnthropic()) so the test can inspect the exact payload sent, while the
// real templating logic in lib/email.ts still runs.
const { getResendMock, sendMock } = vi.hoisted(() => ({
  getResendMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("../lib/email-client", () => ({
  getResend: getResendMock,
}));

const { sendClientOnboardingEmail } = await import("../lib/email");

afterEach(() => {
  getResendMock.mockReset();
  sendMock.mockReset();
});

const PARAMS = {
  to: "client@example.com",
  name: "Jamie Rivera",
  passcode: "ABCD-1234",
  referenceId: "8f14e45f-ceea-4c9e-8b9b-7b0e2b0b4a5c",
  appInstallUrl: "https://expo.dev/accounts/x/projects/gamma-companion/builds/abc",
  setupGuideUrl: "https://example.com/setup-guide",
};

test("sends an email whose text and html both include the passcode, pairing ID, and both links", async () => {
  getResendMock.mockReturnValue({ emails: { send: sendMock } });
  sendMock.mockResolvedValueOnce({ data: { id: "email-1" }, error: null });

  const result = await sendClientOnboardingEmail(PARAMS);

  assert.deepEqual(result, { ok: true });
  assert.equal(sendMock.mock.calls.length, 1);
  const [payload] = sendMock.mock.calls[0];
  assert.equal(payload.to, PARAMS.to);
  for (const content of [payload.text, payload.html]) {
    assert.ok(content.includes(PARAMS.passcode), "missing passcode");
    assert.ok(content.includes(PARAMS.referenceId), "missing pairing ID");
    assert.ok(content.includes(PARAMS.appInstallUrl), "missing install link");
    assert.ok(content.includes(PARAMS.setupGuideUrl), "missing setup guide link");
  }
});

test("HTML-escapes the install and setup-guide links in the html body, same as the other fields", async () => {
  getResendMock.mockReturnValue({ emails: { send: sendMock } });
  sendMock.mockResolvedValueOnce({ data: { id: "email-2" }, error: null });

  await sendClientOnboardingEmail({
    ...PARAMS,
    appInstallUrl: 'https://example.com/install?ref=coach&name="x"',
    setupGuideUrl: "https://example.com/guide?a=1&b=2",
  });

  const [payload] = sendMock.mock.calls[0];
  assert.ok(!payload.html.includes('ref=coach&name="x"'), "raw unescaped install URL leaked into html");
  assert.ok(payload.html.includes("ref=coach&amp;name=&quot;x&quot;"), "install URL wasn't escaped");
  assert.ok(!payload.html.includes("guide?a=1&b=2"), "raw unescaped setup-guide URL leaked into html");
  assert.ok(payload.html.includes("guide?a=1&amp;b=2"), "setup-guide URL wasn't escaped");
});

test("surfaces a Resend send error instead of throwing", async () => {
  getResendMock.mockReturnValue({ emails: { send: sendMock } });
  sendMock.mockResolvedValueOnce({ data: null, error: { message: "invalid from address" } });

  const result = await sendClientOnboardingEmail(PARAMS);

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /invalid from address/);
});

test("fails gracefully with no RESEND_API_KEY configured, without calling Resend", async () => {
  getResendMock.mockReturnValue(null);

  const result = await sendClientOnboardingEmail(PARAMS);

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /RESEND_API_KEY/);
  assert.equal(sendMock.mock.calls.length, 0);
});
