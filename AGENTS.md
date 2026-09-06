<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Stack
- Next.js (App Router) + TypeScript, hosted on Vercel
- Package manager: pnpm (this is a pnpm workspace — `mobile/` is a separate
  workspace package with its own toolchain, not covered by the rules below.
  Its lint + typecheck + unit tests do run in CI as their own steps — see
  "Commands" — but it isn't subject to the TDD-pairing hook, which only
  checks `app/`, `lib/`, `components/`, `scripts/`)
- Unit tests: Vitest
- E2E tests: Playwright
- Health data: a self-hosted health-data aggregator (currently Open
  Wearables — check `specs/prd.md`/Linear for the current vendor; the
  architecture is meant to stay swappable) — see "Data handling" below,
  non-negotiable

## Commands
- Install: `pnpm install`
- Dev server: `pnpm dev`
- Unit tests: `pnpm test` (watch mode: `pnpm test:watch`)
- E2E tests: `pnpm test:e2e`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`
- Mobile lint: `pnpm --filter gamma-companion lint`
- Mobile typecheck: `pnpm --filter gamma-companion typecheck`
- Mobile unit tests: `pnpm --filter gamma-companion test`

## TDD — hard requirement, not a suggestion
- Write or update a failing test BEFORE writing the implementation, for
  every behavior change. Red, then green, then refactor.
- Any commit touching `app/`, `lib/`, `components/`, or `scripts/` must
  include a matching test file (`*.test.ts(x)` or `*.spec.ts(x)`) in the
  same commit.
  This is enforced by a pre-commit hook (`.husky/pre-commit`) and re-checked
  in CI on every PR — the CI check is the real gate, since a local hook can
  be bypassed with `--no-verify` but the PR check cannot.
- If a change genuinely has no testable behavior (pure config, docs), that's
  fine — but treat `--no-verify` as a rare, deliberate exception, not a
  default habit.

## Data handling — permanent, applies to every feature
- The ONLY identifier ever sent to the health-data aggregator (currently
  Open Wearables — this rule applies regardless of vendor, including if it
  changes back to Terra later) is the opaque internal `reference_id`
  (random UUID, generated server-side). Never send name, email, phone, or
  any other directly identifying field to it, in any API call, in any
  feature, ever.
- The real client record lives only in our own database, keyed by that
  same ID.
- If a new feature seems to need more than the opaque ID sent to the
  aggregator, stop and flag it — don't add the field.

## Migrations
- Migrations run as an explicit deploy step, not implicitly on every cold
  start. `vercel.json`'s `buildCommand` runs `pnpm db:migrate` before
  `pnpm build` on every Vercel deployment — Production and each Preview
  migrate their own Neon branch (see VIK-83's per-environment
  `DATABASE_URL`s), exactly once per deployment, in a build log you can
  actually read, instead of racing across however many serverless cold
  starts happen to fire concurrently.
- `lib/db/index.ts`'s real-Postgres path no longer calls `migrate()`. It
  calls `assertSchemaUpToDate()` (`lib/db/schema-check.ts`) instead, which
  fails closed — throws before the app serves any request — if the
  database's latest applied migration hash doesn't match the latest file
  in `drizzle/`. It never migrates mid-request.
- The embedded PGlite path (local dev with no `DATABASE_URL`) is
  unaffected — it still migrates on every boot. It's a single-process,
  zero-config dev database, not a shared server, so the concurrent-cold-
  start race this decision exists to close doesn't apply to it.
- To apply migrations by hand against a real database (`test`/`staging`,
  see VIK-83): `pnpm db:migrate` (reads `DATABASE_URL` from the
  environment). `pnpm db:reset-staging` calls this itself after wiping the
  staging schema — it no longer relies on `getDb()`'s cold-start path to
  re-migrate.
- Origin: `TECH_DEBT.md` §3.5 / VIK-88, elevated from a low-urgency note to
  a decided fix by the VIK-76 incident (implicit cold-start migration,
  combined with a then-shared `DATABASE_URL` across environments, very
  likely applied 11 migrations to production without anyone deciding to).

## Branching & PRs
- No direct commits to `main`. One feature branch per unit of work. This is
  enforced by branch protection on `main` (required PR, required checks, no
  force-push) — not just a written convention (see VIK-82).
- Tag before any risky/irreversible change (schema renames, migrations) so
  there's a clean rollback point — see the `v2.0.0-bodybuilding` tag for
  the pattern used during the V3 terminology rename.
- Every branch gets its own Vercel preview URL automatically — use it to
  verify before opening a PR.
- Open a PR into `main`. Two required checks must pass before merge, no
  exceptions: **CI** (lint, unit tests, TDD pairing check, e2e) and
  **Claude Review** (`.github/workflows/claude-review.yml`). No merging
  with a red check.
- **Independent review, not self-review.** Claude Review runs
  `anthropics/claude-code-action@v1` in its own isolated GitHub Actions job
  — no shared context with whatever session authored the PR — so the same
  agent is never grading its own work. It reviews every PR against this
  file and CLAUDE.md (TDD pairing, data handling, account scoping,
  terminology, spec alignment) and fails the check on any blocking
  finding. This exists because PR #4 shipped a self-documented cross-tenant
  IDOR (missing account scoping on `/api/protocols` and
  `/api/documents/[id]`) straight to `main` in 2026-08 — CI was green, and
  green CI was, at the time, the entire review process.
  - **Tiered model/effort routing** (cost control): PRs under 200 changed
    lines get `claude-sonnet-5` at `high` effort. Larger PRs get
    `claude-opus-5` at `medium` effort. PRs touching a "core
    infrastructure" path — `lib/auth.ts`, `proxy.ts`, `lib/db/schema.ts`,
    `lib/ingest/auth.ts`, `.github/workflows/*`, `drizzle/*` (kept in sync
    with VIK-98's auth/account_id checklist-gate file list) — always get
    `claude-opus-5` at `high` effort, regardless of size. The reviewing
    model is always different from whichever model the authoring session
    used, by construction of the isolated-job setup, independent of tier.

## Specs & tickets
- Work is tracked in **Linear** (team `VIK`, project `Gamma`) — issues are
  the source of truth for what to build right now and its current status.
  `HANDOFF.md` is retired as a "what's next" doc; its process/gotcha notes
  moved to the "Engineering Notes" Linear Document.
- Feature specs still live in `/specs/<feature-name>.md`, written before
  implementation starts, following the phase/prompt structure already in
  use — see `/specs/v3-build-spec.md` as the reference example. Specs hold
  the *why* and the architecture; tickets hold *what's being built now*.
  Don't duplicate one into the other.
- **Before starting work on a ticket, read every spec/doc it links to, in
  full.** The ticket description alone is not sufficient context — specs
  carry constraints, prior decisions, and "why not X" reasoning that
  tickets won't repeat.
- **A real decision made while working a ticket — an architecture choice, a
  scope change, an abandoned approach — must be written into the relevant
  spec, not left sitting in a ticket comment.** Write a new spec (or a new
  dated section in an existing one) if nothing covers it yet. A spec that
  only updates when someone happens to remember is exactly how this
  drifts — this is the discipline that replaces `HANDOFF.md` doing it
  informally.
- If a ticket and its linked spec ever disagree, that's a bug — fix
  whichever is wrong immediately, don't work around the mismatch.

## What NOT to do
- Don't reintroduce bodybuilding-specific terminology (division, weight
  cap, peak week, posing) — this product is generalized coaching now.
- Don't add fields to the health-data aggregator's payload beyond the
  opaque `reference_id` (whichever vendor is current — check `specs/prd.md`).
- Don't merge a PR with failing CI or an unresolved review finding.
