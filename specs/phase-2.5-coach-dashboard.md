# Phase 2.5 — Coach Dashboard — Build Spec

**Source:** a full re-review of `specs/v3-build-spec.md` against the actual
codebase, 2026-08-19. Phase 3 ("AI Weekly Analysis / Coach Brief") assumes a
coach-facing view exists to save briefs to — nothing in the original phase
list (0-4) ever builds one. `specs/client-accounts.md` explicitly deferred
it ("future coach dashboard, not built in this pass") with no phase picking
it back up. Decided with the user via `AskUserQuestion`: give it an
explicit phase, sequenced before Phase 3, rather than let Phase 3 quietly
absorb undefined extra scope or ship broken.
**This pass covers:** a coach-only view listing client accounts and each
client's dashboard/stats — the "somewhere to look" Phase 3's briefs need to
land on.
**Doesn't cover:** the AI brief generation itself (Phase 3, unchanged),
editing a client's settings/check-in template as the coach (natural
follow-on once this exists, not required to unblock Phase 3).
**Effort:** `high` — no schema changes, but it's the first place role-based
access control (`requireCoach()`) actually gets used, and the first UI
surface where one account legitimately reads another account's data.

---

## Why this is smaller than it might look

Phase 1's account-scoping work already did the hard part: `dashboardData(accountId)`,
`weekStats(accountId, weekStart)`, `getSettings(accountId)`, etc. all take an
explicit `accountId` parameter rather than reading it implicitly from the
session. A coach viewing a client's dashboard is just calling the exact
same functions the client's own dashboard uses, with the client's
`accountId` instead of the caller's own — no new data-access layer needed,
just a new authorization path in front of the existing one.

## Design note — single-coach assumption, same as `specs/phase-1-followups.md`

`accounts` has no coach↔client relationship column. "List my clients" is
implemented as "list every account with `role = 'client'`" — correct only
because there's exactly one coach. Flagging this the same way in both specs
so it isn't independently rediscovered and independently "fixed" two
different ways later: when a second coach exists, this needs a real
relationship column (e.g. `accounts.coachId`), and every place that
currently does `eq(accounts.role, 'client')` needs to become
`and(eq(accounts.role, 'client'), eq(accounts.coachId, session.accountId))`.

## Build

**Route:** new `app/clients` (or fold into a renamed nav item — naming TBD,
not load-bearing) — coach-only page. Redirect/403 non-coach sessions the
same way `requireCoach()` already does for API routes; the page itself
needs an equivalent guard since it's a Server Component, not an API route
(same pattern `app/page.tsx` uses for `getCurrentAccount()` + `redirect()`,
just also checking `role === "coach"`).

**API:**
- `GET /api/clients` — `requireCoach()`-gated, lists accounts where
  `role = 'client'` (id, name, maybe last-check-in-date for an at-a-glance
  list).
- `GET /api/clients/[accountId]/dashboard` — `requireCoach()`-gated, calls
  the existing `dashboardData(clientAccountId)`/`weekStats(clientAccountId,
  weekStart)` with the *path param's* account ID, not the coach's own
  session account ID. Double-check the target account actually has
  `role = 'client'` before returning anything — a coach hitting this with
  another coach's ID (once multi-coach exists) shouldn't silently work.

**UI:** client list → click through to a per-client view. Reuse
`app/page.tsx`'s existing dashboard components (`WeightChart`,
`ComplianceChart`, the stat tiles) parameterized by the selected client
instead of duplicating that layout — this is presentation reuse, not a new
design.

## Sets up Phase 3

Once this exists, "save the brief to a coach-facing view" in
`specs/v3-build-spec.md`'s Phase 3 prompt has a concrete target: a section
on the per-client view here, not a new surface Phase 3 has to invent.
Update `specs/v3-build-spec.md`'s Phase 3 section (or a
`specs/phase-3-coach-brief.md`, when that's written) to reference this
route directly once it exists.

## Test plan (TDD — write these first)

- `requireCoach()` actually gets exercised by an integration test for the
  first time — a client-role session 403s both `GET /api/clients` and
  `GET /api/clients/[accountId]/dashboard`.
- A coach session sees only `role = 'client'` accounts in the list, never
  other coach accounts (relevant once a second coach exists, worth testing
  now so the query is right from the start rather than papering over it
  when it becomes reachable).
- `GET /api/clients/[accountId]/dashboard` for a real client account
  returns that client's actual scoped data (weight series, active
  protocol, etc.) — reuse the same fixture pattern
  `tests/stats.test.ts` already established for two-account isolation,
  just asserting the coach *can* see it here instead of asserting isolation.
- `GET /api/clients/[accountId]/dashboard` for a nonexistent or
  non-client account ID 404s rather than erroring or returning empty data
  silently.
