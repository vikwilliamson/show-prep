@AGENTS.md

## Start here if picking up V3 work
- Read `HANDOFF.md` at the repo root first — it's the continuity doc for
  where the V3 rewrite (`specs/v3-build-spec.md`) currently stands, what's
  merged, and what the next step is. Keep it updated as you go.

## Effort
- Default `high` for this repo.
- Bump to `xhigh` for anything touching the data model or schema (the V3
  terminology rename was exactly this kind of change — in-place renames
  are where a skipped file or missed reference is expensive to find later).

## GitHub
- `anthropics/claude-code-action@v1` is NOT currently installed on this
  repo — CI (lint, unit tests, TDD pairing, e2e) is the only automated PR
  gate for now. If/when the GitHub App + `ANTHROPIC_API_KEY` repo secret get
  set up, treat its findings as a real reviewer's and update this note plus
  the "Branching & PRs" section in AGENTS.md to make it a required check.

## Reminders specific to this repo
- This is a rewrite of a bodybuilding-specific app (formerly "Show Prep",
  now "Gamma") into a generalized coaching platform. When in doubt about
  whether something is "generic enough," check AGENTS.md's "what not to
  do" list first.
