@AGENTS.md

## Start here if picking up V3 work
- Check **Linear** first (team `VIK`, project `Gamma`) for what to work on
  and its current status — that's the live source now, not this repo. Read
  every spec/doc a ticket links to before starting it (see AGENTS.md's
  "Specs & tickets").
- **Clear the Audit Remediation milestone before starting a new
  `Feature`-labeled ticket.** The 2026-09-04 audit found real, unfixed
  gaps (cross-tenant scoping, an unenforced TDD gate, undocumented data
  flows) sitting alongside completed feature work. Don't add to that pile
  before it's paid down — work Audit Remediation's Backlog items first, or
  get an explicit go-ahead from Vik to defer a specific low-priority one.
- `HANDOFF.md` is retired as a "what's next" doc — kept in the repo as a
  dated historical record of the pre-Linear V3 rewrite, not something to
  update going forward. Its process/gotcha notes (drizzle-kit quirks,
  PGlite behavior, auth footguns, etc.) now live in the "Engineering Notes"
  Linear Document.

## Effort
- Default `high` for this repo.
- Bump to `xhigh` for anything touching the data model or schema (the V3
  terminology rename was exactly this kind of change — in-place renames
  are where a skipped file or missed reference is expensive to find later).

## GitHub
- `anthropics/claude-code-action@v1` is installed as `.github/workflows/
  claude-review.yml` (`ANTHROPIC_API_KEY` set 2026-09-04) and is a required
  status check on `main` alongside CI — see AGENTS.md's "Branching & PRs".
  Treat its findings as a real reviewer's: a "block" verdict is a real
  blocker, not a suggestion to route around.
- This was set up in response to a 43-PR audit (2026-09-04) that found a
  self-documented cross-tenant IDOR (PR #4) had merged and sat on `main`
  for ~9 days under the old "green CI = merge" policy. The audit's other
  findings live in Linear under the **Audit Remediation** milestone.

## Reminders specific to this repo
- This is a rewrite of a bodybuilding-specific app (formerly "Show Prep",
  now "Gamma") into a generalized coaching platform. When in doubt about
  whether something is "generic enough," check AGENTS.md's "what not to
  do" list first.

## Agent skills

### Issue tracker

Issues are tracked in Linear (team `VIK`, project `Gamma`), not GitHub
Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See
`docs/agents/domain.md`.
