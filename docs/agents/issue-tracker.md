# Issue tracker: Linear

Issues are tracked in **Linear**, team `VIK`, project `Gamma`. Linear issue
status is the live source of truth for what to work on right now — not
GitHub Issues.

## Conventions

- **Before starting a ticket**, read every spec/doc it links to in full.
  Specs live under `/specs/<feature-name>.md` and hold the *why* and
  architecture; tickets hold *what's being built now*. Don't duplicate one
  into the other.
- **A real decision made while working a ticket** — an architecture choice,
  a scope change, an abandoned approach — must be written into the
  relevant spec, not left sitting in a ticket comment. Write a new spec
  (or a new dated section in an existing one) if nothing covers it yet.
- **If a ticket and its linked spec ever disagree**, that's a bug — fix
  whichever is wrong immediately, don't work around the mismatch.
- Use the `claude.ai Linear` MCP tools (`list_issues`, `get_issue`,
  `save_issue`, `save_comment`, etc.) for all Linear operations.

## Pull requests

PRs still go to **GitHub** (`vikwilliamson/show-prep`) and must pass CI
before merge — see "Branching & PRs" in `AGENTS.md`. PRs are not the issue
tracker; they're where the code for a Linear ticket lands.

**PRs as a request surface: no.** _(External PRs are not treated as
feature requests routed through Linear triage.)_

## When a skill says "publish to the issue tracker"

Create or update a Linear issue in team `VIK`, project `Gamma`.

## When a skill says "fetch the relevant ticket"

Look it up in Linear (`get_issue` / `list_issues`), then read every
spec/doc it links to before starting work.
