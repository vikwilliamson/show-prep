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
- [x] `app/api/analysis/route.ts` — switched to `requireAccount(req)` session-based resolution; `getPrimaryCoachAccountId()` deleted (VIK-97). Previously, any logged-in account's "Generate analysis" wrote its result under the earliest-created coach account instead of its own — fixed as part of this change, regression-tested in `tests/analysis-route.test.ts`.

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
- **VIK-96 — settings write scoped by row id only, not accountId.** `PUT
  /api/settings` fetched `current = await getSettings(session.accountId)`
  (correctly account-scoped) but wrote with `.where(eq(settings.id,
  current.id))` — the write's own WHERE clause never restated `accountId`.
  Not exploitable as shipped, since `current.id` can only ever resolve to
  the caller's own row; but nothing enforced that at the write site itself,
  so a future refactor that separated the read from the write (or swapped
  in an unscoped `getSettings` variant) could silently reopen cross-account
  writes with no test catching it. Fixed by restating the account filter
  directly on both the `settings` and `weeklyTargets` updates in the same
  route — `.where(and(eq(table.id, current.id), eq(table.accountId,
  session.accountId)))` — matching the belt-and-suspenders pattern already
  used on `protocols/[id]`'s confirm/supersede UPDATE (VIK-77). Verified
  with a regression test exercising that exact WHERE-clause shape with a
  deliberately mismatched id/accountId pair.
- **VIK-127 — unauthenticated login's per-row scrypt scan.** `POST
  /api/session` looked up the matching account by looping every row and
  calling `verifyPasscode` (scrypt) until one matched — unauthenticated,
  reachable by anyone, cost scaling linearly with account count. Considered
  a passcode-indexed lookup (a deterministic HMAC of the passcode as a
  second, queryable column) instead of rate limiting, but rejected it:
  building that index requires the plaintext passcode for every *existing*
  account to backfill it, and per this doc's own storage design, plaintext
  is deliberately never persisted anywhere past `hashPasscode()` at
  creation — there's no way to backfill the index without forcing every
  current account to reset their passcode. Went with the ticket's "more
  simply" option instead: `lib/rate-limit.ts`, a minimal in-memory
  fixed-window limiter (10 attempts / 5 min per IP, keyed off
  `x-vercel-forwarded-for`/`x-forwarded-for`), checked before any DB/scrypt
  work runs, with the bucket cleared on a correct passcode so a shared
  household IP isn't punished for someone else's earlier typo. A review
  pass flagged the header-missing fallback (shared "unknown" bucket) as a
  possible bypass; checked against Vercel's own docs
  (vercel.com/docs/headers/request-headers) rather than assuming — Vercel
  overwrites `x-forwarded-for` at its edge and never forwards a
  client-supplied value ("this restriction is in place to prevent IP
  spoofing"), so on this app's plain Vercel deployment the header is always
  present and not attacker-controlled; the fallback only fires in local
  dev/tests. Switched the primary key to `x-vercel-forwarded-for` anyway —
  Vercel's docs note plain `x-forwarded-for` "could be overwritten if
  you're using a proxy on top of Vercel," while `x-vercel-forwarded-for`
  stays accurate regardless — so this doesn't quietly regress if a WAF/CDN
  ever gets added in front of the app later. Explicitly a best-effort bound,
  not a complete fix — each Vercel serverless instance has its own memory,
  so a distributed attacker spread across many cold starts isn't fully
  bounded by this alone. Judged sufficient for "isn't a practical
  CPU-exhaustion vector at this app's current scale" (the ticket's actual
  acceptance bar), not for withstanding a determined distributed attacker;
  the timing side-channel the same ticket flagged (early-break-on-match
  reveals roughly how many rows precede the match) was left unfixed — out
  of scope for this pass, would need a constant-time full-table scan
  regardless of match position.

## Test plan (TDD — write these first)

- `lib/auth.ts`: unit tests for `getCurrentAccount`/`requireCoach` against valid, missing, expired, and tampered session cookies, and both roles.
- Passcode hashing/verification: unit tests (hash round-trips, wrong passcode rejected).
- `app/api/session/route.ts`: updated tests — valid passcode sets the right `accountId`/`role`; wrong passcode 401s; empty passcode rejected.
- Migration/backfill: a check script (or integration test) confirming existing data lands on Vik's `account_id` and spouse's account starts empty, run once against a dev DB copy before touching production.
