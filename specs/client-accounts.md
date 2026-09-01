# Client Account Foundation — Build Spec
**Source:** Follow-up scoping conversation, Aug 17–18 2026 (see `specs/v3-build-spec.md` for the parent V3 rewrite this unblocks).
**This pass covers:** the accounts/auth foundation that Phase 1 (Goals/Settings) and Phase 2 (Terra per-client pseudonymous IDs) both depend on — neither phase has anywhere to attach without a concept of "a client" existing first.
**Deferred to per-phase tickets:** actually filtering every existing query/route by `account_id`. That lands incrementally as each subsequent phase ticket touches those routes anyway (Phase 1 wires settings/dashboard, Phase 2 wires the webhook, Phase 3 wires the coach-brief job) — not as one giant migration here. See the checklist at the bottom so nothing gets missed.

---

## Role model

Two roles: `coach` and `client`.

- **Single coach for now (Vik).** No coach-to-coach assignment table, no multi-coach support — YAGNI until there's a second coach.
- **A coach account can also independently be a client of itself** (self-coaching) — this is how Vik's own existing goals/check-in data keeps working exactly as it does today, just now attached to an account row instead of being the app's only implicit user.
- **Coach**: read access across all client accounts (future coach dashboard, not built in this pass), plus the review/approve step on AI-generated content (Phase 3/4 — also not built here, just the role this pass has to exist for).
- **Client**: scoped to their own data only.

## Schema

New `accounts` table:

| column | notes |
|---|---|
| `id` | serial PK |
| `reference_id` | uuid, unique, generated at row creation. This becomes the Terra `reference_id` in Phase 2 — exists from day one so Phase 2 doesn't need its own ID-generation step. |
| `name` | text |
| `email` | text, optional |
| `role` | enum: `coach` \| `client` |
| `passcode_hash` | text (bcrypt/argon2 — never plaintext) |
| `timezone` | text, default `America/Los_Angeles` (matches existing `settings.timezone` default) |
| `created_at` | timestamp |

Add a nullable `account_id` FK (→ `accounts.id`) to every existing per-user table: `settings`, `weekly_targets`, `weight_entries`, `nutrition_entries`, `hydration_entries`, `workouts`, `sleep_sessions`, `daily_activity`, `check_ins`, `documents`, `document_chunks`, `protocols`, `chat_messages`, `sync_log`.

**Backfill migration** (this runs against real production data — take a Neon backup/branch snapshot immediately before, per the standing note from the Phase 0 scope review):
1. Create one `accounts` row for Vik, `role: coach`.
2. Create one `accounts` row for spouse, `role: client`.
3. Assign every existing row in the tables above to Vik's `account_id` (it's all his existing real data today). Spouse's row starts empty.

**2026-08-28 update (VIK-78):** `account_id` is now `NOT NULL` with `ON DELETE CASCADE` on every table listed above — this was the backstop this section always intended but didn't yet enforce. One consequence: `backfillAccounts()`'s row-reassignment step (`WHERE account_id IS NULL`) can never match anything again, since an unassigned row is now schema-impossible. It's left in place as a historical record of the one-time migration rather than stripped out — `findOrCreateAccount`'s bootstrap behavior (idempotent coach/client account creation) is still live and still used by `scripts/backfill-accounts.ts` for fresh-environment setup.

`settings.id = 1` singleton pattern goes away as part of this — `settings` becomes one row per `account_id` instead of a hardcoded single row.

## Auth

- Replace the single shared `APP_PASSWORD` gate with per-account passcode login. `POST /api/session` takes `{ passcode }`, looks up the account by `passcode_hash`, and sets a session cookie carrying `{ accountId, role }`.
- **Passcode alone (not passcode + username)** — a unique passcode per account identifies who's logging in, closest to today's single-shared-password UX while making it per-person. Login page keeps its current single-field form.
- Session cookie: HMAC-signed, carrying `{ accountId, role, exp }`, verified against a new `SESSION_SECRET` env var. No new sessions table — signed cookie is sufficient at this trust level (small private app, a handful of users) and avoids session-cleanup bookkeeping.
- New `lib/auth.ts`: `getCurrentAccount(req)` reads and verifies the session cookie, returns `{ accountId, role }` or `null`. `requireCoach(req)` throws/401s if the caller isn't a coach. These are the primitives every subsequent phase ticket will use to scope its own queries — this pass just builds and tests the primitives, doesn't wire them everywhere yet.

## What this ticket does NOT do

- Doesn't add `account_id` filtering to any existing route's queries (settings, check-ins, documents, chat, ingest, analysis all keep reading/writing without a `WHERE account_id = ...` clause for now) — tracked below instead.
- Doesn't build the coach dashboard UI (client list, aggregate view) — just the role/data model it depends on.
- Doesn't touch `/api/ingest`'s `INGEST_API_KEY` bearer-token auth — Phase 2 replaces that whole path with Terra + `reference_id`, so patching soon-to-be-replaced auth now would be wasted work.

## Follow-up checklist (routes still needing `account_id` scoping)

- [x] `app/api/settings/route.ts`, `app/settings/page.tsx` — Phase 1 (done via `feat/phase-1-account-scoping`)
- [x] `app/page.tsx` dashboard queries — Phase 1 (done via `feat/phase-1-account-scoping`)
- [x] `app/api/checkins/*`, `app/check-in` — Phase 1/3 (done via `feat/phase-1-account-scoping`; also fixed `check_ins`' unique index, which was on `week_start` alone and would have collided across accounts on the same week)
- [x] `app/api/documents/route.ts`, `app/api/documents/[id]/reprocess/route.ts`, `app/documents` — Phase 1 (done via `feat/phase-1-account-scoping`)
- [x] `app/api/documents/[id]/route.ts` (GET/DELETE a single document by ID) — was missed by `feat/phase-1-account-scoping` despite matching its glob (tracked as `TECH_DEBT.md` §1.2); fixed via VIK-77.
- [x] `app/api/chat/route.ts`, `app/chat` — Phase 1 (done via `feat/phase-1-account-scoping`)
- [x] `app/api/protocols/route.ts`, `app/api/protocols/[id]/route.ts` — never listed here in the first place, the root cause of both gaps (tracked as `TECH_DEBT.md` §1.1); fixed via VIK-77.
- [x] `app/api/ingest/[type]/route.ts` — **superseded, ahead of this doc.** VIK-19 (`692ecd1`, `4e05412`) resolved the mobile companion's opaque `referenceId` server-side to `accountId` via `getAccountByReferenceId()` and tags every inserted row (`nutritionEntries`, `weightEntries`, etc.) with it — the single-tenant fallback described below never shipped for this route. This section originally said ingest "does NOT tag inserted rows with `account_id`"; that was true when written and is now stale. Left here as history rather than deleted, per the "fix whichever is wrong immediately" rule below — the code moved first, this doc is catching up.
- [ ] `app/api/analysis/route.ts` — Phase 3. Still on the `getPrimaryCoachAccountId()` fallback; Phase 3 should switch it to real session-based resolution (the route is always called from an already-authenticated dashboard, so this is a smaller lift than ingest's was).

## Auth-hardening follow-ups (VIK-79, VIK-81, VIK-83)

These three shipped without a spec entry at the time — a gap flagged by an
AI-code-review pass on 2026-08-31 against AGENTS.md's "a real decision made
while working a ticket must be written into the relevant spec" rule.
Recorded here now, after the fact, rather than left living only in commit
messages:

- **VIK-79 — auth fail-open on missing env vars.** Both `SESSION_SECRET`
  (session cookies) and `INGEST_API_KEY` (mobile ingest) previously no-op'd
  *open* if their env var was unset, with no production guard — a missing
  Vercel env var would have silently disabled auth entirely rather than
  breaking loudly. `lib/env.ts` now validates every env var with Zod at
  module load and throws at boot if either is missing while
  `process.env.VERCEL` is set. Decision: **fail closed in production,
  fail open only in local dev** (where an unset secret is a developer
  convenience, not a live exposure). CI's e2e job now sets `SESSION_SECRET`
  so `proxy.ts`'s redirect is actually exercised instead of permanently
  no-op'ing.
- **VIK-81 — vector search scoping + performance.** Audited whether
  `lib/rag.ts`'s `retrieve()` could leak one account's document chunks into
  another's chat answers. The account filter turned out to already be
  correct (landed earlier via `77bbcbe`, before this ticket was filed) —
  resolved by adding a **regression test** (two accounts, identically
  embedded chunks, account A's query must never surface account B's) rather
  than re-implementing something already correct. The ticket's other,
  independent finding — a missing HNSW index on
  `document_chunks.embedding` — was real: sequential-scan cosine-distance
  queries don't survive documents accumulating per client, let alone across
  clients once multi-tenant. Fixed and verified against a real Neon branch,
  not just PGlite's pgvector port.
- **VIK-83 — Neon environment isolation.** The Neon↔Vercel integration
  re-shared one `DATABASE_URL` across Production/Development/Preview twice
  during unrelated work, which meant local dev and preview builds could
  point at the real production database. Decision: dedicated `test` and
  `staging` Neon branches with one-command reset scripts
  (`pnpm db:reset-test`, `pnpm db:reset-staging`); `staging` is schema-only
  at creation and only ever populated via migrate+seed, never a
  parent-reset from production, so it can never carry real personal data.
  The Neon integration's Vercel connection is now narrowed to Preview only,
  so per-preview branch injection can't touch the manually-set
  Production/Development values again.

## Test plan (TDD — write these first)

- `lib/auth.ts`: unit tests for `getCurrentAccount`/`requireCoach` against valid, missing, expired, and tampered session cookies, and both roles.
- Passcode hashing/verification: unit tests (hash round-trips, wrong passcode rejected).
- `app/api/session/route.ts`: updated tests — valid passcode sets the right `accountId`/`role`; wrong passcode 401s; empty passcode rejected.
- Migration/backfill: a check script (or integration test) confirming existing data lands on Vik's `account_id` and spouse's account starts empty, run once against a dev DB copy before touching production.
