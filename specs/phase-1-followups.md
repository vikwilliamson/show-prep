# Phase 1 follow-ups — Build Spec

**Source:** a full re-review of `specs/v3-build-spec.md`, `specs/client-accounts.md`,
and `specs/phase-2-terra.md` against the actual codebase, 2026-08-19 — three
gaps found in what `feat/phase-1-account-scoping` shipped, each resolved
with the user via `AskUserQuestion`. Decisions below are locked in, not open
questions.
**This pass covers:** manual macro/calorie goals in Settings, a coach-facing
"add a client" flow, and a check-in template edit route.
**Doesn't cover:** the coach dashboard itself — that's
`specs/phase-2.5-coach-dashboard.md`, split out separately since it's bigger
and gates Phase 3.
**Effort:** `high` — touches `settings` schema (new nullable columns, no
renames) and adds one new account-creation code path; doesn't rise to
`xhigh` since nothing here is an in-place rename or a query-scoping change.
**Sequencing:** none of this depends on Terra/Phase 2 — safe to build in
parallel with the Terra spike.

---

## A. Manual macro/calorie goals in Settings

**Gap:** `v3-build-spec.md`'s Phase 1 prompt lists macros (protein/carbs/fat
or calories) as a Settings/Goals config field. It was never built —
macros only exist today via `protocols`, which requires an AI-extracted,
coach-uploaded document. A self-coached account (explicitly a first-class
case per `specs/client-accounts.md`) has no way to set a nutrition target.

**Decision:** manual fields in Settings as the default target; an active
(confirmed) protocol overrides them when one exists — same shape as
`weeklyTargets` already has a default regardless of whether a coach has
prescribed anything.

**Schema:** add to `settings` (nullable, mirroring `protocols`' existing
column names for consistency):
- `targetCalories: integer`
- `targetProteinG: integer`
- `targetCarbsG: integer`
- `targetFatG: integer`

**Where the override logic lives:** wherever code currently reads
`protocol.calories`/`proteinG`/`carbsG`/`fatG` as "the target" —
`lib/stats.ts`'s `dashboardData`/`weekStats` (macro compliance calc),
`app/page.tsx`'s "Active protocol" card, `app/check-in`'s data-answers —
needs to fall back to `settings.targetCalories` etc. when
`getActiveProtocol(accountId)` returns `null`. Don't scatter this
fallback logic across every call site — add one small helper (e.g.
`effectiveMacroTargets(settings, protocol)` in `lib/stats.ts`) that every
consumer calls instead of reading `protocol` directly.

**UI:** new fields on `app/settings/page.tsx`, alongside the existing
target-weight/height fields. Label them clearly as "used when there's no
active coach protocol" so it's not confusing for accounts that do have a
coach uploading plans.

**API:** add the four fields to `putSchema` in `app/api/settings/route.ts`
(currently missing — that route's schema only has target
name/date/programType/note/weight/height/timezone).

### Test plan
- `effectiveMacroTargets()`: returns protocol's macros when an active
  protocol exists; falls back to settings' manual fields when it doesn't;
  returns `null`s when neither is set.
- `PUT /api/settings` accepts and persists the four new fields, scoped to
  the caller's own account (reuse the `requireAccount()` pattern already in
  that route).

---

## B. Coach-facing "add a client" flow

**Gap:** the only code that ever inserts into `accounts` is
`lib/backfill-accounts.ts` (exactly one coach + one client, by design) and
`scripts/seed.ts` (demo data). `v3-build-spec.md`'s own tester list (John,
Mike, Jake) has no feature to actually onboard them.

**Decision:** a real, small coach-facing feature — not a script, not a
generalized backfill.

**Design note — deliberately assumes single-coach, per existing project
convention.** `accounts` has no coach↔client relationship column (nothing
links a `client` row to "their" coach) — fine today since
`specs/client-accounts.md` already established "single coach for now... no
multi-coach support until there's an actual second coach — YAGNI." This
spec doesn't add a relationship column either; "the coach" creating a
client is implicitly *the* coach, since there's only one. Revisit this
the moment a second coach account is ever created — don't let this
assumption silently persist past that point (same warning
`specs/v3-build-spec.md` gives for Terra Enterprise/BAA).

**API:** new `POST /api/accounts`, gated by `requireCoach()` (its actual
first caller — currently defined, tested, and unused). Takes
`{ name: string }`, generates a random passcode server-side (don't let the
coach choose it — avoids weak/reused passcodes), hashes it via the
existing `hashPasscode()`, creates the account with `role: "client"`,
returns `{ account, passcode }` — the passcode is shown exactly once in the
response for the coach to relay out-of-band (text/call), never stored or
re-displayable in plaintext after that.

**UI:** a small "Add a client" form. No dedicated coach page exists yet
(that's `specs/phase-2.5-coach-dashboard.md`) — put it there once that
lands; until then, a minimal role-gated section on `app/settings/page.tsx`
is a reasonable temporary home.

### Test plan
- `POST /api/accounts`: a coach session creates a client account with a
  hashed passcode; a client session gets 403'd; no session gets 401'd.
- The returned passcode round-trips through `verifyPasscode()` correctly
  and can log in via the existing `/api/session` flow.

---

## C. Check-in template edit route

**Gap:** `specs/client-accounts.md` describes "the coach's check-in
template" (singular), but each account gets its own independent copy via
`getSettings()`'s lazy-create, and `checkinTemplate` isn't in
`PUT /api/settings`'s schema at all — there's no way to ever change it from
its default.

**Decision:** smallest real fix — add the edit capability, keep today's
per-account-copy data model. Not building a shared/referenced
one-template-many-clients structure now (would be speculative — no real
account needs a different template from the default yet).

**API:** add `checkinTemplate` to `PUT /api/settings`'s zod schema, typed
against `CheckinQuestion[]` (see `TECH_DEBT.md` §2.5 — this is also the
right moment to give `CheckinQuestion` a real zod schema instead of the
bare `as CheckinQuestion[]` cast at read time, since this route becomes the
first place untrusted-shaped JSON for this field enters the system).

**Cross-account editing:** given decision B above assumes single-coach, and
this route already scopes strictly to `requireAccount()`'s own
`session.accountId`, a coach editing a *client's* template needs its own
path — not in scope for this spec. For now, `PUT /api/settings` only lets
an account edit its own template (fine for self-coaching); coach-edits-
client's-template is a natural extension once
`specs/phase-2.5-coach-dashboard.md` gives a coach a reason to be looking at
a specific client's settings in the first place.

### Test plan
- `PUT /api/settings` with a valid `checkinTemplate` persists it and
  `GET` reflects the change.
- An invalid shape (e.g. missing `key`/`question`) is rejected with a 422,
  not silently accepted and then breaking `app/check-in` at read time.
