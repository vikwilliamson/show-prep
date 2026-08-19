# Handoff — where the V3 rewrite stands

Read this first, before touching anything. It's the continuity doc for
picking up the V3 generalization rewrite (`specs/v3-build-spec.md`) where
the last session left off. Update it as you go — this is meant to stay
current, not a one-time snapshot.

**Last updated:** 2026-08-19 (updated again same day — see "Phase 2 status"
below). `feat/phase-1-account-scoping` merged (PR #4) into `v3-generalized`;
`TECH_DEBT.md` landed alongside it from a full-codebase audit pass. Phase 2
planning has moved past Terra — see "Phase 2 status" below before picking up
any aggregator-related work; the vendor changed, not just the plan.

## TL;DR

- Working branch: **`v3-generalized`**. All V3 phase work lands here via
  short-lived feature branches + PRs, not direct commits (except small
  pure-infra changes — see "Process notes" below). It eventually merges to
  `main` as one unit once all phases are done.
- Rollback point if anything V3-related goes sideways: tag
  `v2.0.0-bodybuilding` on `main`.
- Product is now called **Gamma** (was "Show Prep" — renamed 2026-08-19,
  see `specs/phase-0-terminology.md`'s tail end and the rebrand commits).
- **Phase 1's account_id gap is closed and merged.** Settings, dashboard,
  check-ins, documents, and chat are all real per-account-scoped now. See
  "What shipped on `feat/phase-1-account-scoping`" below for the details and
  the known remaining gaps (ingest/analysis still on a single-tenant
  fallback — that's Phase 2/3's job to close for real).
- **`TECH_DEBT.md` exists** — a full-codebase audit, organized by severity.
  Read it before starting unrelated cleanup work; it already covers a lot of
  ground, including two real account-scoping bugs (`app/api/protocols/*`,
  `app/api/documents/[id]/route.ts`) that Phase 1 itself missed.

## Phase sequence has changed — a new Phase 2.5 was inserted

A full re-review of every spec against the actual codebase (2026-08-19)
found that Phase 3 ("AI Weekly Analysis / Coach Brief") assumes a
coach-facing multi-client view exists to save briefs to — no phase in the
original 0-4 list ever builds one; it was deferred in
`specs/client-accounts.md` with no owner. Resolved with Vik: it gets its
own phase, sequenced between Terra and the AI brief.

Current sequence: **Phase 0** (terminology, done) → **Phase 1** (goals/
settings + account scoping, done — but see `specs/phase-1-followups.md` for
three small gaps found on re-review: manual macro goals, client onboarding,
check-in template editing, none of which block Phase 2) → **Phase 2**
(health-data aggregation — spec'd for Terra at `specs/phase-2-terra.md`, but
that spec is now **stale**; pivoted to a self-hosted Open Wearables approach,
not started, see "Phase 2 status" below before touching this) → **Phase 2.5**
(coach dashboard, spec'd not started, `specs/phase-2.5-coach-dashboard.md`,
required before Phase 3 can actually ship — unrelated to the aggregator
pivot, don't confuse the two "2.5"-adjacent threads) → **Phase 3** (AI coach
brief, per `specs/v3-build-spec.md`, now depends on 2.5) → **Phase 4** (AI
transparency pass, unchanged).

None of Phase 1's follow-ups or Phase 2.5 depend on the Open Wearables
spike — either is fair game to pick up in parallel with the aggregator
spike/webhook work if that's what's next.

## Phase 2 status — Terra deprioritized, pivoted to self-hosted Open Wearables (updated 2026-08-19)

Terra turned out to have no free/cheap sandbox tier — their self-serve plan
lists at $499/mo, sized for real production volume, not a 5-person pilot.
Decided with Vik in a follow-up session the same day: don't commit to that
spend without a real quote, and don't let it block Phase 2.
**`specs/phase-2-terra.md` is now stale.** Its underlying requirements
(webhook signature verification, `reference_id`→`account_id` resolution,
payload normalization into the existing tables, idempotency, the consent
flow, the manual-entry-fallback gap it correctly identified) mostly still
apply — but not "which vendor," and it hasn't been rewritten yet.

**Decision: adopt the [Open Wearables](https://github.com/the-momentum/open-wearables)
React Native SDK for both iOS and Android, self-hosted**, rather than paying
Terra or hand-rolling a second (HealthKit) native integration next to the
existing Health-Connect one. Reasoning:

- The pilot cohort (Vik, spouse, John, Mike, Jake) is **mixed iOS +
  Android** — HealthKit support is required from day one, not a later
  add-on. That ruled out "Android DIY forever, add a vendor later for iOS
  only."
- The existing hand-rolled Android pipeline (`mobile/src/mapper.ts`,
  `healthConnect.ts`, `sync.ts`, `background.ts`, `config.ts`) is
  code-complete and unit-tested headlessly, but **has never actually run
  against a real device** — `mobile/README.md`'s "test on a Galaxy S25"
  section is a runbook, not a record of it having happened. There is no
  working-in-production code being protected here; it can stay in git
  history for reference, not be preserved as the live path.
- Open Wearables ships a real Expo-Module-API React Native SDK (confirmed
  compatible with this app's Expo/RN stack — an earlier check suggesting
  Flutter-only was wrong/outdated) covering HealthKit + Samsung Health +
  Health Connect in one API. It replaces `mobile/src`'s entire custom sync
  engine rather than adding a second one alongside it.
- Self-hosting cost is real but bounded at this scale: Open Wearables is
  FastAPI + Postgres + Redis + Celery via Docker Compose — needs a small
  persistent host (Railway/Fly/Render; not Vercel-deployable), plausibly
  under $50/mo. Separate, mandatory either way: the $99/year Apple
  Developer Program membership needed for real-device iOS testing.
- **Architecture stays loosely agnostic, not formally abstracted** — Vik's
  explicit call. Keep naming/schema generic (the `hc_uid` → `provider_uid`
  rename already planned in `specs/phase-2-terra.md` §1 still applies) and
  avoid hardcoding Open-Wearables-specific assumptions where avoidable, but
  don't build a formal pluggable-provider interface now. Matches this
  project's existing YAGNI pattern (no multi-coach support until there's a
  second coach, etc.) — formalize the abstraction only if/when an actual
  Terra swap becomes real.
- **Compliance-boundary reasoning, for whoever picks this up:** self-hosting
  does not change the app's own PII/pseudonymization architecture
  (`accounts.referenceId`, no name/email ever sent to a health-data
  processor) — that's unchanged and already built. What self-hosting adds
  is owning the *new* service's infra security (HTTPS, network-isolated
  Postgres/Redis, an image-patching cadence, backups, a written
  incident-response answer) — real but bounded work at 5-user pilot scale,
  not a blocker. Terra's actual compliance value was narrow (their own ToS
  restriction on PHI without a BAA) — that restriction simply doesn't apply
  once there's no Terra in the pipe. The real trigger for revisiting Terra
  isn't pilot-scale risk, it's a future partner (see `v3-build-spec.md`'s
  Gen Health / Max's clinic outreach item) whose own vendor security review
  may specifically want a company with a compliance program behind it, not
  a self-hosted OSS tool.
- Terra's startup-pricing program is still worth pursuing **in parallel,
  not as a blocker** on the spike below — a real cheap quote is new
  information for a future decision, not a reason to wait.

**Recommended next step — a local spike, not a full build:**
1. Stand up Open Wearables locally via `docker compose up -d`
   ([repo](https://github.com/the-momentum/open-wearables)).
2. Confirm nutrition/dietary data actually flows through **both**
   connectors — HealthKit's Dietary Energy/macros (MyFitnessPal writes
   these out on iOS: confirmed two-way sync, batched 5-15 min, iPhone-app-
   initiated only, not iPad/web) and Health Connect's `Nutrition` record
   type (MFP → Health Connect on Android, same assumption the old DIY
   pipeline made). Open Wearables' own docs are inconsistent about whether
   nutrition is covered on both connectors or just one — needs hands-on
   confirmation, not another docs read.
3. Confirm outbound webhook maturity — Open Wearables' own docs describe
   outbound webhooks as "in active development." If they're not solid yet,
   the backend needs to poll Open Wearables' API instead of receiving
   pushes — a real design fork; decide it from spike evidence.
4. Once 2-3 are answered, `specs/phase-2-terra.md` needs an actual rewrite
   (new file, e.g. `specs/phase-2-open-wearables.md`) reflecting whichever
   design the spike confirms. Not done yet — flagged here so it isn't
   missed.

Vik is having a separate agent session run this spike/implementation. If
you're that session: start at step 1 above, and update this section again
once you have real answers.

- Terra API credentials: never added — no longer the plan, see above.
- **Important operational note, still live and unrelated to the vendor
  pivot:** `.env.local`'s own comment confirms the Neon integration
  connects the **same database** to Production, Preview, *and*
  Development — there's no separate per-environment Neon branch outside of
  CI's per-PR branches. This means `scripts/backfill-accounts.ts` needs to
  run against that shared database before anyone can actually log into
  **any** deployed `v3-generalized` environment (preview or eventual
  production), not just before the final merge to `main` as previously
  assumed. Local dev is unaffected (uses local PGlite unless
  `DATABASE_URL` is set). Still Vik's call to run it — needs his own
  coach/client passcodes and a Neon backup taken first, see
  `specs/client-accounts.md`.

## What's on `feat/phase-1-account-scoping` (done this session, not yet merged)

Started from the recommended next step in the previous version of this doc
("wire `getCurrentAccount()` into `app/api/settings/route.ts` +
`app/page.tsx`") and it turned out `lib/stats.ts` is a shared kernel: almost
every route in the Follow-up checklist calls into it, so scoping settings +
dashboard forced scoping everything downstream of it in the same pass. Went
with the full Phase 1 ripple (settings, dashboard, check-ins, documents,
chat) rather than a half-migrated shim, per a scope discussion at the start
of the session — see `specs/client-accounts.md`'s Follow-up checklist,
which is now up to date.

**What changed:**
- `lib/stats.ts`: `getSettings`, `getTargets`, `getActiveProtocol`,
  `dailyMacros`, `dailyWeights`, `weekStats`, `dashboardData` all now take a
  required `accountId`. `getSettings`/`getTargets` lazily create a default
  row per account on first access (replaces the old `ensureDefaultRows`
  singleton in `lib/db/index.ts`, which is now deleted).
- `lib/auth.ts`: added `requireAccount(req)` (the `NextRequest` version of
  the existing `requireCoach`/`getCurrentAccount` pattern — routes do
  `const session = requireAccount(req); if (session instanceof NextResponse)
  return session;`) and `getPrimaryCoachAccountId()`, an explicit,
  documented single-tenant fallback for the two routes that don't have
  session context yet (see below).
- `lib/rag.ts`: `indexDocument`/`retrieve`/`answerQuestion` all scope to
  `accountId` now; document chunks get tagged with `accountId` at index
  time.
- Routes wired to real session-based scoping: `app/api/settings`,
  `app/page.tsx` (dashboard — server component, reads the cookie directly
  via `next/headers`, redirects to `/login` if there's no session),
  `app/api/checkins` + `app/api/checkins/draft`, `app/api/documents` +
  `.../[id]/reprocess`, `app/api/chat`.
- Routes on the `getPrimaryCoachAccountId()` single-tenant fallback (not
  session-based — see "What's still not real multi-tenant" below):
  `app/api/analysis`, `app/api/ingest/[type]`.
- **Schema migration** (`drizzle/0010`, `0011`): `check_ins`' unique index
  was on `week_start` alone — a real bug once multiple accounts exist, since
  two clients' check-ins for the same week would have collided on upsert.
  Changed to a composite unique index on `(account_id, week_start)`. Also
  added unique indexes on `settings.account_id` and
  `weekly_targets.account_id` (there was nothing stopping two concurrent
  first-access calls from creating duplicate per-account rows before this).
- `scripts/seed.ts` now finds-or-creates a "Demo Coach" account (passcode =
  `NEXT_PUBLIC_DEMO_PASSWORD` if set, matching the existing portfolio-demo
  login button) and tags all seeded data with its `account_id`.
- Deleted the local `.data/pglite` dev database once (disposable per
  existing project convention — no real data lost) because the old
  singleton `settings` row (`id: 1`, inserted with an explicit id bypassing
  the sequence) collided with the new lazy-create-on-read logic's
  auto-generated inserts. If you hit `duplicate key value violates unique
  constraint "settings_pkey"` locally, that's this — `rm -rf .data/pglite`.
- New/updated tests: `tests/auth.test.ts`, `tests/stats.test.ts` (new,
  account-isolation coverage for the `lib/stats.ts` functions),
  `tests/settings-route.test.ts` (new), `tests/checkins-route.test.ts` (new
  — specifically exercises the composite-unique-index upsert). All 50 tests
  pass; `pnpm lint`, `pnpm typecheck`, `pnpm build` all clean.
- Verified end-to-end in a browser against freshly seeded local data:
  logged out → redirected to `/login`; demo login → dashboard, settings,
  documents, and check-in pages all render correctly scoped to the seeded
  account.

**What's still not real multi-tenant (known, deliberate, documented in
`specs/client-accounts.md`'s checklist):**
- `app/api/ingest/[type]/route.ts` (Phase 2) doesn't tag inserted rows with
  `account_id` — it only uses the single-tenant fallback for a timezone
  lookup, per the existing instruction not to patch a route Phase 2 is going
  to replace wholesale. **Consequence:** once this branch merges, data
  synced through the mobile companion won't show up on the now-scoped
  dashboard/stats until Phase 2's Terra webhook actually sets `account_id`
  on write. This is a real, user-visible regression for daily mobile sync
  use, not just a security nicety — Phase 2 should be treated as
  higher-priority than its position in the phase list might suggest, or
  ingest's insert paths should get a minimal `account_id` patch as an
  interim step. Flagging this explicitly so it doesn't get missed.
- `app/api/analysis/route.ts` (Phase 3) is on the same single-tenant
  fallback. Lower urgency than ingest — it's write-once-per-week AI output,
  not a continuous sync path — but should switch to real session-based
  resolution when Phase 3 touches this route anyway (it's always called
  from an already-authenticated dashboard, so there's no ingest-style
  auth-mechanism blocker here).
- **Before this merges to `main` / goes live**: `scripts/backfill-accounts.ts`
  has never been run against production (only against local/test dev DBs
  this session and previously). Production currently deploys from `main`,
  not `v3-generalized`, so this isn't an active risk yet — but whoever does
  the eventual `v3-generalized` → `main` merge needs to run the backfill
  against production first, or the coach's own login will have no account to
  authenticate against.
- Local dev needs `SESSION_SECRET` set for login to work at all
  (`createSessionToken` throws without it) and for the `proxy.ts` session
  gate to be active (it's a silent no-op without it — every route is open).
  `.env.local` didn't have one; added a dev-only placeholder there for this
  session's verification (gitignored, not a real secret). If it's not there
  when you pick this up, that's expected — set your own.

## What's merged into `v3-generalized` so far

1. **`feat/client-account-foundation`** (PR #2) — `specs/client-accounts.md`.
   New `accounts` table (coach/client roles, `reference_id` uuid that
   doubles as the future Terra ID), `account_id` FK added to every
   per-user table, per-account passcode auth (`lib/auth.ts`,
   `scripts/backfill-accounts.ts`) replacing the old single shared
   `APP_PASSWORD`, and `proxy.ts` (this Next.js version's `middleware.ts`
   equivalent — see the "not the Next.js you know" warning in AGENTS.md)
   gating every route on "is there a valid session" when `SESSION_SECRET`
   is set. Deliberately did **not** wire `account_id` filtering into any
   route's queries yet — that was tracked as the checklist in
   `specs/client-accounts.md`, now closed for Phase 1 (see above).
2. **`feat/phase-0-terminology`** (PR #3) — `specs/phase-0-terminology.md`.
   In-place rename away from bodybuilding-specific terminology
   (`divisions`→`programType` single-select, `showName`/`showDate`→
   `targetName`/`targetDate`, `nextCompetitionNote`→`targetNote`,
   `documents.category` `division_rules`→`program_rules`), full removal of
   the Weight Cap feature (both calculators, route, nav, dashboard tile),
   generic AI prompts, and the Gamma rebrand.
3. Also on `v3-generalized` directly (small, pure-infra, no PR): CI trigger
   extended to run on `v3-generalized` too, not just `main`; the Neon
   per-PR database branching workflow.

Not yet started: Phase 2 (health-data aggregation, now Open Wearables — see
"Phase 2 status" above), Phase 2.5 (coach dashboard), Phase 3 (AI weekly
brief), Phase 4 (AI transparency pass) — see `specs/v3-build-spec.md` for
what each covers.
Phase 1 (Goals/Settings config layer + the account_id wiring it depended on)
is done pending `feat/phase-1-account-scoping`'s PR + merge.

## Recommended next step

`feat/phase-1-account-scoping` is already merged (PR #4) — the step
previously listed here is done. Current next step: the Open Wearables local
spike — see "Phase 2 status" above for full context and the four concrete
steps. The ingest `account_id`-on-write gap documented above is folded into
that same Phase 2 work now, not a separate interim patch.

## Key decisions from this session (see memory + specs for full detail)

If you have access to this project's Claude Code memory
(`v3_rewrite_scope_decisions.md`, `v3_process_setup.md`), read those first —
they have the full reasoning. Summary of what's locked in:

- **Program Type is single-select**, not multi (`settings.programType: text`,
  not an array) — bodybuilding's cross-competing divisions don't map onto
  general coaching program types. Values: `physique_prep` | `weight_loss` |
  `general_coaching`.
- **Coach + client roles, single coach for now.** Vik is the coach; a coach
  account can also independently be a client of itself (self-coaching).
  No multi-coach support until there's an actual second coach.
- **No data-preservation ceremony needed for schema changes right now** —
  all `settings`/`documents` data in every environment, including
  production, is disposable seed/demo data Vik generated for testing, not
  real client data. Don't build elaborate Neon-branch backfill scripts by
  default; ask whether the data is real first. (This does NOT apply to the
  `accounts` table itself going forward — real people will actually sign up
  once Phase 1 lands.)
- **Superseded 2026-08-19:** this bullet used to say Terra Mobile SDK
  compatibility needed a spike before committing to Phase 2's mobile plan.
  Terra is no longer the plan (see "Phase 2 status" above) — Open Wearables'
  React Native SDK is confirmed Expo-Module-API-compatible on paper, but
  still needs its own hands-on spike (the 4 steps in "Phase 2 status")
  before committing to the full mobile rewrite. Same caution, different
  vendor.

## Process notes for whoever picks this up

- **TDD is enforced**, not optional: `.husky/pre-commit` + CI both run
  `scripts/check-tdd-pairing.sh`. Tests live in a top-level `tests/`
  directory (not colocated in `app/`/`lib/`/`components/`) — the script
  matches test files anywhere in the diff, not just nested under source
  dirs, so this works correctly.
- **Effort**: default `high`, bump to `xhigh` for anything touching the
  data model/schema (`CLAUDE.md`). The `check_ins`/`settings`/
  `weekly_targets` index changes and the `lib/stats.ts` signature changes
  this session both qualified.
- **Branching**: one feature branch off `v3-generalized` per unit of work,
  PR back into `v3-generalized` (not `main`). This also gets you a real
  isolated Neon database branch automatically (the
  `Create/Delete Branch for Pull Request` workflow) — genuinely useful for
  verifying schema migrations against production-shaped data before merge,
  see how `feat/client-account-foundation`'s PR did it.
- **`pnpm db:generate` and column renames**: if a rename shows up as a
  simultaneous drop+add in the same schema diff, drizzle-kit will try to
  prompt interactively asking "was this renamed?" — which fails
  non-interactively. Work around it with two separate `db:generate` passes
  (add the new column first with the old one still present, generate; then
  remove the old column, generate again) rather than fighting the prompt.
  Bit us three times in the terminology-rename session. (This session's
  index-only changes didn't hit this — no renames, just drop-index/
  create-index.)
- **Local dev data**: PGlite at `.data/pglite`, single-process — don't run
  `pnpm seed`/tests/dev server against it concurrently. Wipe with
  `rm -rf .data/pglite` any time you want a clean slate; `pnpm seed`
  rebuilds it. This session hit a real case where this was necessary, not
  just theoretical — see "What's on `feat/phase-1-account-scoping`" above.
- Full terminology/rebrand sweeps need to check `README.md` and
  `mobile/README.md` too, not just `app/`/`lib`/`components/` — both were
  missed on the first pass in the terminology-rename session and only
  caught by a follow-up full-repo grep plus a browser click-through (grep
  alone missed a header subtitle that was only visible when the page
  actually rendered).
- `proxy.ts` is this Next.js version's `middleware.ts` — easy to miss if
  you go looking for the conventional filename (this session did, briefly,
  before the build output's own warning surfaced it). `tests/proxy.test.ts`
  covers its session-gate behavior.

## Open/deferred items, not blocking anything

- Vercel project name / the `show-prep-gamma.vercel.app` domain were
  deliberately NOT renamed to match "Gamma" — that's Vik's call in the
  Vercel dashboard, outside this repo.
- `settings.nextCompetitionNote`-adjacent field is now `targetNote` — if
  you're grepping old context/specs and see `nextCompetitionNote`, it's
  stale, the field was renamed.
- Twilio SMS, telehealth-partner API packaging, formal HIPAA/SOC 2, Terra
  Enterprise+BAA — all explicitly deferred per `specs/v3-build-spec.md`,
  don't build any of it yet.
- The Terra compliance email (`specs/terra-compliance-email-draft.md`) is
  still unsent and no longer gates Phase 2 now that Open Wearables is the
  near-term path (see "Phase 2 status" above). Worth sending anyway,
  separately, to get a real startup-pricing quote — parallel track, not
  blocking.
- Client-side pages (`app/check-in`, `app/documents`, `app/chat`,
  `app/settings`) are all `"use client"` components that fetch their own
  data — `proxy.ts` keeps unauthenticated users from ever loading them, but
  none of them have explicit handling for a session expiring *while the tab
  is already open* (a stale 401 from the API would currently just leave the
  page's loading state hanging rather than redirecting to `/login`). Not
  addressed this session — full-scope, not part of the account_id checklist,
  flagging for whoever next touches auth UX.
