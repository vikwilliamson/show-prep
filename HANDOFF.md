# Handoff — where the V3 rewrite stands

Read this first, before touching anything. It's the continuity doc for
picking up the V3 generalization + Terra rewrite (`specs/v3-build-spec.md`)
where the last session left off. Update it as you go — this is meant to
stay current, not a one-time snapshot.

**Last updated:** 2026-08-18, after finishing `feat/phase-1-account-scoping`
(not yet merged — PR not opened yet) off `v3-generalized`.

## TL;DR

- Working branch: **`v3-generalized`**. All V3 phase work lands here via
  short-lived feature branches + PRs, not direct commits (except small
  pure-infra changes — see "Process notes" below). It eventually merges to
  `main` as one unit once all phases are done.
- Rollback point if anything V3-related goes sideways: tag
  `v2.0.0-bodybuilding` on `main`.
- Product is now called **Gamma** (was "Show Prep" — renamed 2026-08-19,
  see `specs/phase-0-terminology.md`'s tail end and the rebrand commits).
- **The account_id gap described in the previous version of this doc is now
  closed for Phase 1's routes.** `feat/phase-1-account-scoping` (branched off
  `v3-generalized`, not yet PR'd) wires real per-account data scoping into
  settings, the dashboard, check-ins, documents, and chat. See "What's on
  `feat/phase-1-account-scoping`" below before doing anything else — there
  are a few things the next session needs to know before merging or
  deploying this.

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

Not yet started: Phase 2 (Terra), Phase 3 (AI weekly brief), Phase 4 (AI
transparency pass) — see `specs/v3-build-spec.md` for what each covers.
Phase 1 (Goals/Settings config layer + the account_id wiring it depended on)
is done pending `feat/phase-1-account-scoping`'s PR + merge.

## Recommended next step

1. Open the PR for `feat/phase-1-account-scoping` → `v3-generalized`, let CI
   run (the Neon per-PR branch is a good place to sanity-check the
   `check_ins` migration against production-shaped data before merge).
2. Then either: (a) do the minimal ingest `account_id`-on-write patch flagged
   above as an interim fix before starting Phase 2 proper, or (b) treat that
   as Phase 2's opening task and prioritize starting Phase 2 sooner than
   Phase 3/4. Worth a quick decision with Vik given it affects his own daily
   mobile-sync usage once this merges.

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
- **Terra Mobile SDK compatibility with the Expo companion app is
  unverified** — do a small time-boxed spike confirming it works with this
  app's `expo prebuild` setup before committing to the full Phase 2 mobile
  ticket plan.

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
- Client-side pages (`app/check-in`, `app/documents`, `app/chat`,
  `app/settings`) are all `"use client"` components that fetch their own
  data — `proxy.ts` keeps unauthenticated users from ever loading them, but
  none of them have explicit handling for a session expiring *while the tab
  is already open* (a stale 401 from the API would currently just leave the
  page's loading state hanging rather than redirecting to `/login`). Not
  addressed this session — full-scope, not part of the account_id checklist,
  flagging for whoever next touches auth UX.
