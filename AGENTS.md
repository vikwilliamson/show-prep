<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Stack
- Next.js (App Router) + TypeScript, hosted on Vercel
- Package manager: pnpm (this is a pnpm workspace — `mobile/` is a separate
  workspace package with its own toolchain, not covered by the rules below)
- Unit tests: Vitest
- E2E tests: Playwright
- Health data: Terra API — see "Data handling" below, non-negotiable

## Commands
- Install: `pnpm install`
- Dev server: `pnpm dev`
- Unit tests: `pnpm test` (watch mode: `pnpm test:watch`)
- E2E tests: `pnpm test:e2e`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`

## TDD — hard requirement, not a suggestion
- Write or update a failing test BEFORE writing the implementation, for
  every behavior change. Red, then green, then refactor.
- Any commit touching `app/`, `lib/`, or `components/` must include a
  matching test file (`*.test.ts(x)` or `*.spec.ts(x)`) in the same commit.
  This is enforced by a pre-commit hook (`.husky/pre-commit`) and re-checked
  in CI on every PR — the CI check is the real gate, since a local hook can
  be bypassed with `--no-verify` but the PR check cannot.
- If a change genuinely has no testable behavior (pure config, docs), that's
  fine — but treat `--no-verify` as a rare, deliberate exception, not a
  default habit.

## Data handling — permanent, applies to every feature
- The ONLY identifier ever sent to Terra is the opaque internal
  `reference_id` (random UUID, generated server-side). Never send name,
  email, phone, or any other directly identifying field to Terra, in any
  API call, in any feature, ever.
- The real client record lives only in our own database, keyed by that
  same ID.
- If a new feature seems to need more than the opaque ID sent to Terra,
  stop and flag it — don't add the field.

## Branching & PRs
- No direct commits to `main`. One feature branch per unit of work.
- Tag before any risky/irreversible change (schema renames, migrations) so
  there's a clean rollback point — see the `v2.0.0-bodybuilding` tag for
  the pattern used during the V3 terminology rename.
- Every branch gets its own Vercel preview URL automatically — use it to
  verify before opening a PR.
- Open a PR into `main`. CI (lint, unit tests, TDD pairing check, e2e) must
  pass before merge. No merging with a red check.

## Specs
- Feature specs live in `/specs/<feature-name>.md`, written before
  implementation starts, following the phase/prompt structure already in
  use — see `/specs/v3-build-spec.md` as the reference example.

## What NOT to do
- Don't reintroduce bodybuilding-specific terminology (division, weight
  cap, peak week, posing) — this product is generalized coaching now.
- Don't add fields to the Terra payload beyond the opaque reference_id.
- Don't merge a PR with failing CI or an unresolved review finding.
