# Mobile Companion Onboarding — Build Spec

**Source:** raised in a `/grill-me` session on 2026-09-02, alongside the
Phase 3/4 follow-ups (`specs/phase-3-ai-weekly-coach-brief.md`, `specs/
phase-4-ai-transparency.md`). Not part of the original phase sequence —
this is a real, previously-unspec'd gap in the mobile companion's
onboarding flow, found by reading `mobile/App.tsx` and `mobile/src/
config.ts` directly rather than assumed.

**Depends on:** nothing structurally. Independent of Phase 3/4. Touches
`app/api/accounts/route.ts`, `app/settings/page.tsx`, `mobile/app.json`,
`mobile/App.tsx`, `mobile/src/config.ts` — no schema changes (`accounts.
email` and `accounts.referenceId` already exist).

---

## Problem Statement

Pairing a new client's phone to their account today requires them to
personally enter a server URL, an API key, and a pairing ID into the
mobile app — three of those four fields are things a non-technical client
should never see, let alone type correctly. Confirmed by reading `mobile/
App.tsx`: the entire app is one config screen with four manually-entered
text fields (Server URL, Ingest API Key, Pairing ID, Device ID), a "Grant
HC permissions" button, and a "Sync now" button. Nothing else exists in the
app — no dashboard, no data view.

Separately, there's no single place today where a coach can hand a new
client everything they need at once. `app/api/accounts` (the "add a
client" endpoint) already returns the new client's pairing ID
(`referenceId`) in its response, but `app/settings/page.tsx`'s
`AddClientSection` only displays the login passcode — the pairing ID is
silently discarded on the frontend. A client has no way to get their own
pairing ID except by first logging into the *web* app with their passcode
and finding it themselves on the Settings page — which assumes they've
already sorted out getting the app installed and connected before they can
even discover the one piece of information the app needs.

## Solution

1. **Server URL and Ingest API Key stop being client-facing.** They're
   per-deployment config (one Gamma server, one shared key for every
   client), not per-client — there is no reason a client should ever see
   or type them. Bake both into the app build via `mobile/app.json`'s
   existing `extra` block (already used for the EAS project ID) instead
   of an editable text field. Device ID (already auto-generated) also
   stops being a user-facing field. **Pairing ID becomes the only field a
   client ever touches.**
2. **The "Add a client" flow collects an email address and surfaces the
   pairing ID it already has.** Small form addition (`accounts.email`
   already exists as a column, just isn't collected in that form) plus
   displaying the `referenceId` the API response already includes but the
   UI currently drops.
3. **A one-time onboarding email**, sent on an explicit action (not
   automatically on account creation), containing: the client's login
   passcode, their pairing ID, a link to install the companion app, and a
   link to an externally-hosted Health Connect/MyFitnessPal setup guide
   (built and hosted outside this repo — out of scope here, just linked
   to).

## User Stories

1. As a coach adding a new client, I want to enter their name and email in
   one form, so that I don't need a second step or a different screen to
   capture how to reach them.
2. As a coach, I want to see a new client's pairing ID alongside their
   login passcode right after creating their account, so that I have
   everything I need to onboard them in one place.
3. As a coach, I want to trigger an onboarding email whenever I'm actually
   ready to hand a client their access — not automatically the moment I
   create their account — so that I control timing (e.g. I might create
   the account before the app build is ready to share).
4. As a coach, I want that onboarding email to include the client's
   passcode, their pairing ID, a link to install the app, and a link to a
   setup guide for connecting MyFitnessPal/Health Connect, so that a
   client can self-serve the entire setup without a live walkthrough.
5. As a client receiving the onboarding email, I want to install the app,
   open it, and only ever have to enter one thing (my pairing ID) — not a
   server address or an API key — so that setup doesn't require technical
   knowledge I don't have.
6. As a client, I want the app to already know how to reach the server
   without me configuring anything beyond my pairing ID, so that a wrong
   or mistyped server URL/API key can never be the reason my sync doesn't
   work.
7. As a coach, I want to resend or regenerate the onboarding email content
   if a client loses it or a passcode needs to change, so that I'm not
   stuck if the first send fails or goes to the wrong inbox (loose
   requirement — full "reissue a passcode" flow may not exist yet; note
   as a real need even if not fully built in this pass).
8. As the person operating this at demo scale, I want to use a
   no-setup-required sending address (a provider sandbox domain) so that I
   can start sending onboarding emails today without first verifying a
   custom domain.

## Implementation Decisions

- **Config baking.** `mobile/app.json`'s `expo.extra` gains `serverUrl`
  and `apiKey` fields (matching the existing pattern that already holds
  the EAS `projectId`). `mobile/src/config.ts`'s `loadConfig()` reads
  defaults for `serverUrl`/`apiKey` from `expo-constants`'s
  `Constants.expoConfig?.extra` instead of defaulting to empty strings.
  `mobile/App.tsx` drops the Server URL, Ingest API Key, and Device ID
  input fields entirely — only the Pairing ID field (and the existing
  "Grant HC permissions" / "Sync now" buttons) remain user-facing. Takes
  effect on the next EAS build (config/`app.json` changes always require
  one, same as every other native-config change already in this app per
  `mobile/README.md`).
- **Add-client form.** `app/settings/page.tsx`'s `AddClientSection` gains
  an email input alongside the existing name input. `app/api/accounts/
  route.ts`'s `POST` handler accepts and stores `email` on the new
  account (schema already supports it — `accounts.email`). The
  post-creation display block (currently showing only the passcode) adds
  the pairing ID (`account.referenceId`, already present in the response,
  just unused client-side) as a second copyable field.
- **Email sending.** New `lib/email.ts` wrapping the Resend SDK (chosen
  for its free tier at demo scale — 3,000/month, 100/day — and minimal
  setup: its sandbox `resend.dev` from-address requires no domain
  verification to start sending today). One function,
  `sendClientOnboardingEmail({ to, name, passcode, referenceId,
  appInstallUrl, setupGuideUrl })`, called from a new coach-only action —
  either a new `POST /api/accounts/[id]/onboarding-email` route or folded
  into the existing add-client UI as a "Send onboarding email" button that
  fires after account creation (button, not automatic — see User Story 3).
  New env var `RESEND_API_KEY`; treat as optional/non-fatal if missing
  (log and surface an error to the coach, don't crash account creation —
  this is a convenience feature, not an auth/security gate like
  `SESSION_SECRET`/`INGEST_API_KEY`).
- **Email content.** Passcode, pairing ID, an install link, and a setup-
  guide link. The setup guide itself (a plain reference page covering
  "connect MyFitnessPal and Samsung Health to Health Connect before you
  open the companion app") is hosted externally (e.g. a simple
  Lovable-built site) — **out of scope for this repo**, just a URL the
  email links to.
- **App distribution (this pass):** link to the EAS internal-distribution
  build's own download page — it already exists per build, no new infra
  needed at current scale (2-3 testers). A sturdier mechanism (an
  always-latest link, a Play Store listing) is real future work, not
  needed yet — see "Out of Scope."
- **Passcode display timing.** No change to the existing "shown once,
  relay it out-of-band" passcode behavior (`app/settings/
  page.tsx:348-349`) — the onboarding email becomes the "out-of-band"
  channel for both the passcode and the pairing ID, replacing manual
  text/call for whoever opts to use it. The manual copy/paste path stays
  available as a fallback (not every coach interaction needs to route
  through email).

## Testing Decisions

- **`lib/email.ts`**: mock the Resend client at its own API-call seam
  (same pattern as `tests/extract.test.ts`/`tests/brief.test.ts` mocking
  `getAnthropic()` — mock the SDK client, not the whole module's return
  value, so real templating/formatting logic actually runs). Assert the
  rendered email includes the passcode, pairing ID, and both links, and
  that a missing `RESEND_API_KEY` fails gracefully (doesn't throw past
  the caller in a way that breaks account creation).
- **`app/api/accounts` (extended)**: existing route test coverage
  extended to assert `email` persists on creation; new coverage for
  whatever new onboarding-email route/action is added, asserting it's
  coach-only and scoped to a real client account (same `getClientAccount`
  404-on-non-real-client pattern used throughout the coach-dashboard
  routes, e.g. `app/api/clients/[accountId]/dashboard/route.ts`).
- **Mobile (`mobile/test/`)**: `config.ts`'s default-loading behavior
  gets a test asserting `serverUrl`/`apiKey` come from the baked-in
  `extra` config, not empty strings, mirroring the existing `mobile/test/
  config.test.ts` style.
- **No RTL test needed for the removed App.tsx fields** — deleting form
  fields isn't new behavior to assert, it's the absence of previously-
  tested behavior; the mobile test suite's existing coverage for `sync.
  ts`/`mapper.ts` is unaffected by this change.

## Out of Scope

- **A sturdier app-distribution mechanism** (always-latest install link,
  Play Store listing). Real future work once tester count grows past
  current demo scale — needs its own ticket, not bundled here.
- **The externally-hosted Health Connect/MyFitnessPal setup guide
  itself.** Built and hosted outside this repo (e.g. Lovable); this spec
  only covers linking to it from the onboarding email.
- **A mobile-app screen for the client to view their own synced data.**
  Confirmed as a real, separate, currently-nonexistent feature — see
  `specs/mobile-dashboard-view.md`.
- **QR-code-based pairing** (scanning instead of typing the pairing ID) —
  already tracked separately as VIK-101, filed before this spec existed.
  Complementary to this spec, not a substitute: even with QR scanning,
  the server URL/API key still shouldn't be client-facing, and the email
  is still how a client learns their passcode regardless of how the
  pairing ID itself gets into the app.
- **SMS as a delivery channel.** Considered and rejected — the PRD
  already flags Twilio as deferred pending Vik's own research for an
  unrelated feature (client chat), and the same account/carrier-
  registration friction applies here. Email is the pragmatic choice at
  this scale.
- **Reissuing/rotating a passcode** if a client loses their onboarding
  email. Real need (User Story 7), not fully designed here — flag for
  whoever picks this spec's tickets up, don't silently assume it's
  covered.

## Further Notes

- This whole spec exists because a `/grill-me` pass asked "how does a
  client actually get onboarded" and the honest answer, checked against
  the real code, was "badly." Worth remembering that lesson: the mobile
  companion's *config* screen was real-device-validated (`specs/
  phase-2-nutrition.md`'s VIK-16 addenda) but its *onboarding UX* never
  got the same scrutiny until now.
- Once this ships, `mobile/README.md`'s setup instructions (currently
  written for a developer audience — Server URL, API key, manual Pairing
  ID entry) need updating to match, and VIK-75 (the product-testing
  onboarding doc) should be written against the *new* flow, not the old
  one — don't let that doc get written against a flow this spec is about
  to replace.
