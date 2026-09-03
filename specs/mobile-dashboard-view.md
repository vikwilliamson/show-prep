# Mobile Companion — Client Dashboard View — Build Spec (Deferred)

**Status: deferred, not scheduled.** Raised during the same 2026-09-02
`/grill-me` pass that produced `specs/mobile-companion-onboarding.md`, as a
confirmed real gap rather than something to build now. Has no bearing on
whether the demo's Android sync story works — the web dashboard already
shows the same data the mobile app syncs. Written down so it isn't lost,
not because it's next.

**Depends on:** `specs/mobile-companion-onboarding.md` landing first
(pairing/config simplification) — no point building a data-view screen on
top of an app that's still hard to onboard into. No dependency on Phase 3/4.

---

## Problem Statement

Confirmed by reading `mobile/App.tsx` in full: the companion app has no
screen for a client to view their own data. It's a config-and-sync utility
— enter a pairing ID, grant Health Connect permissions, tap sync, see a
"last sync" timestamp. A client who wants to see their weight trend, macro
compliance, or dashboard has to open the web app in a mobile browser
instead — which works, but means the native app they installed shows them
nothing about themselves, only a sync status log.

## Solution

A read-only dashboard screen inside the companion app, showing the same
core data the web dashboard (`app/page.tsx`) already computes and serves —
reusing existing API surfaces rather than duplicating the computation
logic on-device.

## User Stories

1. As a client using the companion app, I want to see my current weight
   vs. target, my macro compliance, and days-to-target inside the app
   itself, so that I don't need to separately open a mobile browser to
   check my own progress.
2. As a client, I want the mobile dashboard to reflect data the moment
   after I sync, so that tapping "Sync now" feels like it accomplishes
   something visible, not just an opaque background action.
3. As a client, I want the mobile dashboard to be read-only (no editing
   settings/targets from the phone) — the web app already owns
   configuration, the phone's job is sync + a quick glance.
4. As the person maintaining this, I want the mobile dashboard to call the
   same server-side data functions the web dashboard already uses
   (`lib/stats.ts`'s `dashboardData()`/`weekStats()`), not reimplement
   macro-compliance/trend math on-device, so there's one source of truth
   for these numbers.

## Implementation Decisions

- **New authenticated API surface for the mobile app.** The web dashboard
  today is a Next.js server component reading session cookies directly
  (`app/page.tsx`); the mobile app has no session cookie, only its
  `referenceId` (pairing ID) and the shared `INGEST_API_KEY` bearer token.
  Needs a new route (e.g. `GET /api/mobile/dashboard`) authenticated the
  same way `/api/ingest/*` is today (bearer token + `referenceId` →
  `accountId` resolution via `getAccountByReferenceId()`, already built
  for ingest) rather than inventing a new auth mechanism.
- **Reuse `dashboardData()`/`weekStats()` as-is** (`lib/stats.ts`) — same
  functions the web dashboard calls, just served through the new mobile-
  facing route instead of a server component.
- **Screen scope, first pass**: current weight vs. target, days-to-target,
  active protocol summary, this-week-at-a-glance (water/sleep/lifting/
  cardio vs. targets) — the same "top of `app/page.tsx`" content, not the
  full 90-day chart/14-day compliance chart (charting libraries and native
  rendering are a bigger lift — candidate for a second pass, not this
  spec's first cut).
- **Navigation**: a second screen/tab alongside the existing config
  screen (`mobile/App.tsx` becomes two screens instead of one) — exact
  navigation library choice (React Navigation vs. a simpler manual
  screen-swap given the app's current single-screen simplicity) is an
  open implementation decision for whoever picks this up, not resolved
  here.

## Testing Decisions

- New mobile-facing API route: coach-*and*-client-accessible (unlike the
  coach-only `/api/clients/[accountId]/*` routes — this is a client
  viewing their own data), scoped strictly to the `referenceId`-resolved
  `accountId`, same test shape as `tests/ingest-route.test.ts`'s
  account-scoping coverage.
- Mobile-side: whatever the mobile test setup already covers (`mobile/
  test/*.test.ts`, currently headless unit tests for `mapper.ts`/`sync.
  ts`/`config.ts`) extends to cover the new screen's data-fetching logic;
  full component/rendering tests depend on what RN testing setup exists
  by the time this is picked up (none currently, per VIK-87's flagged gap
  in mobile static analysis/tooling — worth checking whether that's
  closed before starting this).

## Out of Scope

- Charts/trend visualization on-device (90-day weight, 14-day compliance)
  — first pass is numbers/summary only, per "Screen scope" above.
- Editing anything from the mobile app (settings, targets, protocols) —
  read-only, full stop, for this spec.
- Push notifications or any "come check your dashboard" prompt — passive
  screen only.
- iOS — no iOS companion app exists yet at all (`specs/
  phase-2-nutrition.md`'s §3 iOS spike is itself unstarted); this spec is
  Android-only by inheritance, not by a separate decision.

## Further Notes

- This is the second of two specs the same grill session produced
  specifically to make sure real, confirmed gaps don't get silently
  dropped just because they're not urgent for the demo. See `specs/
  mobile-companion-onboarding.md`'s "Further Notes" for the same point.
- Worth revisiting VIK-87 (mobile workspace has no ESLint/static analysis)
  before or alongside this — adding a second real screen to a codebase
  with zero linting is a worse time to discover that gap than now.
