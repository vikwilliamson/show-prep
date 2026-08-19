# Handoff — where the V3 rewrite stands

Read this first, before touching anything. It's the continuity doc for
picking up the V3 generalization + Terra rewrite (`specs/v3-build-spec.md`)
where the last session left off. Update it as you go — this is meant to
stay current, not a one-time snapshot.

**Last updated:** 2026-08-19, after merging PR #3 (`feat/phase-0-terminology`)
into `v3-generalized`.

## TL;DR

- Working branch: **`v3-generalized`**. All V3 phase work lands here via
  short-lived feature branches + PRs, not direct commits (except small
  pure-infra changes — see "Process notes" below). It eventually merges to
  `main` as one unit once all phases are done.
- Rollback point if anything V3-related goes sideways: tag
  `v2.0.0-bodybuilding` on `main`.
- Product is now called **Gamma** (was "Show Prep" — renamed 2026-08-19,
  see `specs/phase-0-terminology.md`'s tail end and the rebrand commits).
- **The single most important open gap**: the app has an `accounts` table
  and `account_id` columns everywhere (from `feat/client-account-foundation`),
  but almost nothing actually *uses* them yet — every route still reads/
  writes a hardcoded `settings.id = 1`. See "The account_id gap" below
  before starting Phase 1.

## What's merged into `v3-generalized` so far

1. **`feat/client-account-foundation`** (PR #2) — `specs/client-accounts.md`.
   New `accounts` table (coach/client roles, `reference_id` uuid that
   doubles as the future Terra ID), `account_id` FK added to every
   per-user table, per-account passcode auth (`lib/auth.ts`,
   `scripts/backfill-accounts.ts`) replacing the old single shared
   `APP_PASSWORD`. Deliberately did **not** wire `account_id` filtering
   into any route yet — that's tracked as a checklist in
   `specs/client-accounts.md` and is the gap described below.
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

Not yet started: Phase 1 (Goals/Settings config layer), Phase 2 (Terra),
Phase 3 (AI weekly brief), Phase 4 (AI transparency pass) — see
`specs/v3-build-spec.md` for what each covers.

## The `account_id` gap — read before starting Phase 1

Every route below still queries/writes without any account scoping
(`eq(settings.id, 1)` hardcoded, or no `WHERE account_id = ...` clause at
all). This isn't a bug so much as explicitly deferred scope from the
client-accounts ticket — but it means **the app is still single-tenant in
practice** despite the schema supporting multiple accounts. Phase 1
(Goals/Settings as the core config layer, per real accounts starting with
Vik and spouse) cannot actually be multi-client until this is wired in:

- [ ] `app/api/settings/route.ts`, `app/settings/page.tsx`
- [ ] `app/page.tsx` dashboard queries
- [ ] `app/api/checkins/*`, `app/check-in`
- [ ] `app/api/documents/*`, `app/documents`
- [ ] `app/api/chat/route.ts`, `app/chat`
- [ ] `app/api/ingest/[type]/route.ts` → will become `app/api/health-webhook`
      in Phase 2 anyway — don't patch the doomed one, replace it there
- [ ] `app/api/analysis/route.ts`

`lib/auth.ts`'s `getCurrentAccount()`/`requireCoach()` are the primitives
to use for this — they exist and are tested, just not called from any
route yet.

**Recommended next step**: start Phase 1 by wiring `getCurrentAccount()`
into `app/api/settings/route.ts` + `app/page.tsx` first (the two most
central), scoping their queries by the logged-in account's `account_id`
instead of the hardcoded `1`. That unblocks everything else in the
checklist incrementally as each route gets touched.

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
  data model/schema (`CLAUDE.md`). The account_id wiring above and any
  further schema work both qualify.
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
  Bit us three times this session (`lib/db/schema.ts`'s settings table).
- **Local dev data**: PGlite at `.data/pglite`, single-process — don't run
  `pnpm seed`/tests/dev server against it concurrently. Wipe with
  `rm -rf .data/pglite` any time you want a clean slate; `pnpm seed`
  rebuilds it.
- Full terminology/rebrand sweeps need to check `README.md` and
  `mobile/README.md` too, not just `app/`/`lib`/`components/` — both were
  missed on the first pass this session and only caught by a follow-up
  full-repo grep plus a browser click-through (grep alone missed a header
  subtitle that was only visible when the page actually rendered).

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
