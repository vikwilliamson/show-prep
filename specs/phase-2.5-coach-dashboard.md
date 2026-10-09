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

## 2026-09-15 addendum — client account Edit/Delete (VIK-134)

`app/settings/page.tsx`'s `AddClientSection` covered create; there was no
way to fix a typo in a client's name/email or to remove a client account
entirely. Added `PATCH`/`DELETE /api/accounts/[accountId]`
(`requireCoach()` + `getClientAccount()` scoping, same pattern as
`app/api/accounts/[accountId]/onboarding-email/route.ts`) and a
`ClientActions` component on `/clients/[accountId]`.

- **Edit is scoped to name/email only** — passcode and role are
  intentionally excluded. Passcode rotation is already flagged as
  unbuilt/out-of-scope in `specs/mobile-companion-onboarding.md`'s "Out of
  Scope" section; this pass doesn't fold it in. Role isn't editable because
  nothing in the product needs to promote a client to coach (or vice
  versa) — the single-coach assumption noted above means that's not a
  supported operation at all right now.
- **Delete requires typing the client's exact name** before the real
  delete button enables, not just a single confirm click — this is a
  cascading, irreversible destruction of every record tied to the account
  (nutrition, weight, documents, briefs, everything) via VIK-78's
  `ON DELETE CASCADE`. No "undo."
- No new schema or `lib/auth.ts` changes — `deleteAccount()` already
  existed (VIK-78) but was only exercised by tests until this ticket wired
  it up to a real route and UI action.

## 2026-10-08 addendum — per-client target/nutrition settings; coach login feedback

**Decision: a coach has no goals of their own in this product.** Target
name/date/weight, program type, height, timezone, the manual nutrition
target, and the weekly check-in thresholds were editable only on
`/settings`, which for a coach edited the *coach's own* `settings` row —
not any client's. A coach had no way to set these for a client. They now
live on `/clients/[accountId]` (`ClientSettingsForm`), saved through the new
coach-only `GET`/`PUT /api/clients/[accountId]/settings` (`requireCoach()` +
`getClientAccount()` 404-on-non-client scoping, same as the sibling
`dashboard`/`brief` routes). Both that route and `PUT /api/settings` share
`lib/settings-schema.ts`.

- **`/settings` for a coach is now just "Add a client".** The Target,
  Nutrition target, Weekly targets, and Companion pairing ID sections are
  gone for the coach role (a coach has no Health Connect data to pair). A
  client's own `/settings` is unchanged.
- **"Current weight" is not editable.** It's derived from synced weigh-ins
  (`weight_entries`), not a setting. The editable value is **Target weight**.
- `PUT /api/settings` still accepts a coach session writing its own row —
  left alone, since the coach UI no longer exposes it and nothing else
  depends on it being removed.
- **Login feedback:** `/login` shows "Login successful." in the same spot as
  "Wrong passcode." and then redirects with a full-page navigation
  (`window.location.assign("/")`) instead of `router.push`. The nav links
  rendered on the login page prefetch `/`; the proxy answers that logged-out
  prefetch with a redirect to `/login`, and the client router cache can
  replay it — stranding a successfully logged-in user on the login page.

**2026-10-08 follow-up — read-only until Edit.** The per-client settings form
shipped always-visible at the bottom of `/clients/[accountId]`. Reworked:
the page is read-only (a details list under the heading) until the coach
clicks **Edit**, which reveals one form for name, email, and every
per-client setting (`ClientActions` + `ClientSettingsFields`; the separate
`ClientSettingsForm` is gone). Save does `PATCH /api/accounts/[accountId]`
then `PUT /api/clients/[accountId]/settings`, updates the read-only view from
the responses right away, and calls `router.refresh()` so the server-rendered
stat tiles catch up. Program type is no longer required to save — that guard
existed for a client's own first-run setup and would have blocked a coach
from simply fixing a typo in a name.

**2026-10-08 follow-up — dashboard sections hide during Edit.** While the Edit
form is open, the Bodyweight (last 90 days), Macro compliance (last 14 days),
and This-week-at-a-glance cards are hidden, so the form isn't competing with
the charts. The stat tiles and the weekly brief stay visible. Edit state lives
in `ClientActions` but those cards are server-rendered, so the page wraps its
content in `ClientEditModeProvider` and the three cards in `HideWhileEditing`
(`components/ClientEditMode.tsx`); they return on Save or Cancel, and stay
hidden if a save fails and the form remains open.
