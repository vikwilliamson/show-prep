# Tech debt

A point-in-time audit of the codebase (2026-08-18), done as a dedicated pass
separate from feature work — not a backlog that's meant to stay perfectly in
sync with the code. Findings are grouped by theme, most-actionable first
within each group. Nothing here has been fixed; this is a map for picking
things off as you work through the relevant part of the codebase.

Each finding gives file:line references, why it matters concretely, and a
rough severity (`high` = real bug/security risk, `medium` = real but
lower-stakes correctness or maintainability risk, `low` = worth doing
eventually, no urgency). Items already tracked elsewhere (`HANDOFF.md`,
`specs/client-accounts.md`) are referenced, not duplicated in full.

---

## Aggregator-pivot note (added 2026-08-19, after the audit below) — read before triaging mobile findings

Several findings below (§1.6, §1.7, §2.2, §2.6, §4.10, §6.1, §6.3, §6.4) are
about `mobile/src/mapper.ts`, `healthConnect.ts`, `sync.ts`, `background.ts`,
`config.ts` — the hand-rolled Android-only Health-Connect sync engine. Per
`HANDOFF.md`'s "Phase 2 status," that code is being **replaced**, not
extended: Phase 2 now adopts the Open Wearables React Native SDK for both
iOS and Android, self-hosted, instead of either Terra or a hand-rolled
second (HealthKit) integration next to this one. Don't spend time fixing
these findings first — they're about code on its way out. §6.2 and §3.7
touch `App.tsx`, which will likely change substantially too but isn't
guaranteed to be fully replaced — worth a fresh look once the new mobile
code exists, not an assumption of moot. §3.6 (mobile has zero static
analysis) is **not** moot — it's about the workspace's tooling setup, which
applies regardless of which SDK the code inside it uses.

---

## 1. Security / data isolation

These are the highest-priority items — several are direct continuations of
the account-scoping work that just landed, and were either missed by that
work's own scope or are latent bugs the audit surfaced independently.

### 1.1 `app/api/protocols/route.ts` and `app/api/protocols/[id]/route.ts` have zero account scoping — `high`
Neither file calls `requireAccount()` or filters any query by `accountId`.
Concretely:
- `GET /api/protocols` (`app/api/protocols/route.ts:5-20`) lists **every
  account's protocols**, optionally filtered by `status` but never by who's
  asking.
- `PATCH /api/protocols/[id]` (`app/api/protocols/[id]/route.ts:19-64`) lets
  any authenticated session confirm/reject/reactivate **any protocol row by
  ID**, regardless of which account owns it. Worse, the "confirm/reactivate"
  path (lines 52-56) runs
  `UPDATE protocols SET status='superseded' WHERE status='active' AND id != $id`
  with no account filter — confirming one account's protocol currently
  supersedes **every other account's active protocol**, globally.

This wasn't an oversight in this session's implementation so much as a gap
in the original ticket: `specs/client-accounts.md`'s Follow-up checklist
never listed `/api/protocols` at all. It needs the same `requireAccount()` +
`eq(protocols.accountId, ...)` treatment the other Phase 1 routes got.

### 1.2 `app/api/documents/[id]/route.ts` has zero account scoping — `high`
`GET` (lines 5-17) and `DELETE` (lines 19-27) both key off `documents.id`
alone. Any authenticated session can read or **permanently delete** any
account's document by guessing/enumerating IDs. Same missing-from-checklist
story as 1.1 — `app/api/documents/route.ts` and `.../[id]/reprocess/route.ts`
got scoped this session; this sibling file was missed.

### 1.3 Ingest tables' unique indexes aren't account-scoped — `high`
`lib/db/schema.ts`: `nutrition_hc_uid_idx` (135), `weight_hc_uid_idx` (150),
`hydration_hc_uid_idx` (163), `workout_hc_uid_idx` (181), `sleep_hc_uid_idx`
(197) are all `uniqueIndex(...).on(t.hcUid)` alone, not
`(accountId, hcUid)`. Worse, `activity_local_date_idx` (line 214) is a
unique index on `local_date` **by itself** — only one `daily_activity` row
can exist per calendar date across every account in the system.

This is the exact bug class already found and fixed this session for
`check_ins`, `settings`, and `weekly_targets` (see `HANDOFF.md`'s "Schema
migration" note, `drizzle/0010`-`0011`) — it just wasn't applied to the six
ingest tables, because ingest itself doesn't tag rows with `accountId` yet
(tracked as a known Phase 2 gap in `HANDOFF.md`). Once Phase 2 starts
writing real `account_id` values here, two accounts syncing data for the
same date/device will collide on upsert. Worth fixing as part of Phase 2's
ingest rewrite, not deferred further. (Phase 2's ingest rewrite is now
planned around a self-hosted Open Wearables integration rather than Terra —
see `HANDOFF.md`'s "Phase 2 status" — but this finding applies regardless of
vendor.)

### 1.4 Auth gates silently fail open when misconfigured, with no production guard — `high`
- `proxy.ts:17` — the whole session gate no-ops when `SESSION_SECRET` is
  unset.
- `lib/ingest/auth.ts:9` — the ingest bearer-token gate no-ops when
  `INGEST_API_KEY` is unset.

Both are documented as deliberate for local dev, but neither has a
production fail-closed guard — contrast `lib/db/index.ts:25-31`, which
explicitly throws if `DATABASE_URL` is unset while `VERCEL` is set. If
`SESSION_SECRET` or `INGEST_API_KEY` is accidentally omitted from a
production deploy's env vars, the entire app (or the ingest endpoint)
becomes open to any caller — no error, no log line, nothing to alert on.
Same pattern as the DB check would close this: `if (!env.sessionSecret &&
process.env.VERCEL) throw ...`.

### 1.5 Ingest bearer token comparison isn't constant-time — `medium`
`lib/ingest/auth.ts:12` — `token !== env.ingestApiKey` is a plain string
comparison, a textbook timing side-channel for secret comparison. Low risk
today (personal, typically-unexposed endpoint per the file's own comment),
but the codebase already uses `timingSafeEqual` correctly elsewhere
(`lib/auth.ts`) — this one spot doesn't. Cheap fix if this endpoint's
exposure assumptions ever change.

### 1.6 Mobile: ingest bearer token stored in plaintext AsyncStorage — `medium`
`mobile/src/config.ts:24-26` persists `apiKey` via `AsyncStorage.setItem`,
which on Android is unencrypted SharedPreferences, not
`expo-secure-store`/keystore-backed. `secureTextEntry` on the input
(`App.tsx:111`) only obscures on-screen display, not storage at rest. The
token grants write access to the production ingest API per the mobile
README's own setup instructions.

### 1.7 Mobile: likely no cleartext HTTP support in real builds — `high`
`README.md:43-44` documents pointing the app at a plain-HTTP LAN IP
(`http://192.168.1.10:3210`) for local testing, but `mobile/app.json` has no
`android.usesCleartextTraffic: true` or network security config, and
`android/` is gitignored/regenerated via `expo prebuild` so there's nowhere
such an override could live today. Android blocks cleartext traffic by
default for apps targeting the API level Expo SDK 54 uses. The EAS
`preview` APK (the actual shipped build type per `eas.json`) will likely
fail every LAN-HTTP `fetch()` — i.e. the primary documented local-testing
workflow may not work in a real build, only in a dev client.

---

## 2. Correctness bugs (not security, but produce wrong behavior/output)

### 2.1 Non-null assertion produces literal "null%" in AI-drafted coach messages — `high`
`lib/ai/analysis.ts:87`:
```ts
`Avg calories ${n.avgCaloriesDeltaPct! >= 0 ? "+" : ""}${n.avgCaloriesDeltaPct}% vs plan; ${n.onTargetDays}/${n.daysLogged} logged days on target.`
```
Gated only on `stats.protocol?.calories` (line 85), not on whether any
nutrition was actually logged that week. Per `lib/stats.ts:236-262`,
`avgCaloriesDeltaPct`/`onTargetDays` are `null` whenever `daysLogged === 0`
— a completely normal "didn't log this week" case. The `!` doesn't throw;
it silently renders `"Avg calories null% vs plan; null/0 logged days on
target."` This string feeds both the AI weekly analysis prompt and the
pre-filled check-in draft that goes to the user's real coach. Reachable in
production, not a theoretical edge case.

### 2.2 Mobile: a single malformed weight record can permanently wedge weight sync — `high`
`mobile/src/mapper.ts:38-44` (`mapWeight`) sends `weightKg:
r.weight?.inKilograms as number` with no fallback, unlike every other
mapper. The server's `weightRecord` schema requires
`weightKg: z.number().positive()`, and `batchSchema(...).safeParse(body)`
(`app/api/ingest/[type]/route.ts:44-50`) validates the **entire batch in one
shot** — one bad record 422s the whole POST, up to 500 records
(`BATCH_SIZE`, `mobile/src/sync.ts:28`). Because
`mobile/src/sync.ts:138-153` only advances a type's cursor on success, a
single Health Connect weight record with a missing field would fail sync
indefinitely, blocking every other weight record in that overlap window
along with it.

### 2.3 LLM-extracted date string trusted directly into a `NOT NULL` date column — `medium`
`lib/ai/extract.ts:10-15` — `effective_date` is only prompt-described as
`YYYY-MM-DD`, not enforced by a zod regex/refine. It flows straight into
`effectiveFrom: p.effective_date ?? todayLocal(...)`
(`app/api/documents/route.ts:146`, `.../reprocess/route.ts:56`) against
`protocols.effective_from`, a `date().notNull()` column
(`lib/db/schema.ts:92`). A non-ISO string from the model (hallucination,
"TBD", two-digit year) surfaces as an opaque Postgres insert error instead
of a structured validation error at the actual AI boundary.

### 2.4 `indexDocument`'s delete-then-insert isn't transactional — `medium`
`lib/rag.ts:43-64` — delete existing chunks, insert new ones, update
`embeddedAt`, as three sequential statements with no `db.transaction(...)`.
If the insert throws partway (bad embedding, DB hiccup), the document is
left with zero chunks and a stale `embeddedAt`; chat retrieval quietly
returns nothing for it until someone notices and re-runs reprocess. Directly
contradicts the function's own "idempotent per doc" doc comment.

### 2.5 `settings.checkinTemplate` and `check-in` page's key lookup are two independent, hand-synced sources of truth — `medium`
`lib/checkin-template.ts`'s `CheckinQuestion` is a TypeScript-only shape;
`settings.checkinTemplate` is unvalidated `jsonb` cast with a bare `as
CheckinQuestion[]` at read time (`app/api/checkins/route.ts:35`, `.../draft/
route.ts:37`). Separately, `app/check-in/page.tsx:20-27`'s
`DATA_ANSWER_KEYS` re-declares the template's question keys mapped to
`dataAnswers()`'s differently-named keys (`lib/ai/analysis.ts:120-127`) with
no shared constant linking them. Renaming a key in one place desyncs the
other silently — a prefill just stops appearing, no error anywhere.

### 2.6 Mobile: sleep stages sent as meaningless raw integers — `medium`, currently latent
`mobile/src/mapper.ts:59-64` (`mapSleep`) does `stage: String(s.stage)`,
producing values like `"1"`, `"4"`. Contrast `mapExercise`
(lines 73-95), which correctly resolves HC's integer constants to semantic
strings. `react-native-health-connect` exports an equivalent
`SleepStageType` constant that mapper.ts never uses. Harmless today (nothing
reads `sleep_sessions.stages`, it's opaque `jsonb`), but the data being
persisted right now is already wrong and will need a backfill whenever a
sleep-stage feature gets built.

### 2.7 Ingest schemas have no upper bounds on numbers or string lengths — `medium`
`lib/ingest/schemas.ts` — `calories: z.number().nonnegative()`,
`weightKg: z.number().positive()`, `volumeMl: z.number().nonnegative()`,
free-length strings for `title`/`exerciseType`/sleep `stage`. This is the
one API authenticated by a static bearer token rather than session, and its
output feeds straight into `WeekStats` averages and then AI-generated
narrative text with no sanity clamp anywhere in between. A single absurd
value (`calories: 1e12`) passes validation and silently corrupts weekly
data.

### 2.8 `batchSchema` allows an empty `records` array — `low`
`lib/ingest/schemas.ts:76-82` — `.max(2000)` with no `.min(1)`. An empty
batch does a full round trip (auth check, timezone lookup, sync-log insert)
for nothing.

---

## 3. Missing safety nets (CI, transactions, cascades)

### 3.1 CI never runs `pnpm typecheck` or `pnpm build` — `high`
`.github/workflows/ci.yml`'s steps are install → lint → TDD pairing check →
unit tests → Playwright install → E2E — no `tsc --noEmit`, no `next build`.
`.husky/pre-commit` is the same: TDD-pairing script + `pnpm test`, no lint,
no typecheck. This session's own verification (`pnpm lint`, `pnpm
typecheck`, `pnpm build`, all confirmed clean by hand) isn't enforced going
forward — a type error or a build-only failure (SWC/`"use client"` boundary
issues that only surface under `next build`, not `next dev`/vitest) can
merge undetected.

### 3.2 Every `accountId` FK omits `onDelete`, and this is already causing test friction — `high`
Every `accountId: integer(...).references(() => accounts.id)` across 13
tables in `lib/db/schema.ts` has no `onDelete` clause (defaults to
RESTRICT), unlike `documentChunks.documentId` (`cascade`) and
`protocols.documentId` (`set null`), which do specify one. Already a proven
footgun: `tests/stats.test.ts:38`'s own comment reads `// Children first —
accounts.id has no ON DELETE CASCADE`, and every test `afterEach` needing to
delete an account has to hand-order deletes across N child tables. There's
no `deleteAccount()` helper; a future "delete client account" feature will
hit FK violations unless every call site remembers the full child-table
list.

### 3.3 Playwright E2E runs with the session gate effectively disabled — `medium`
`playwright.config.ts`'s `webServer.command` is `pnpm dev`, and CI's E2E job
never sets `SESSION_SECRET`. Since `proxy.ts` no-ops without it (see 1.4),
the redirect-to-`/login`/401 behaviors are only exercised by
`tests/proxy.test.ts` in isolation — never end-to-end against the real
running app. A regression in cookie handling or the matcher config wouldn't
be caught by E2E at all.

### 3.4 `backfillAccounts()` runs 13 sequential UPDATEs with no transaction — `medium`
`lib/backfill-accounts.ts:58-133`. `HANDOFF.md` explicitly notes this script
"has never been run against production" and that the safety net is a manual
Neon snapshot beforehand, not atomicity. A network blip partway through
would leave some tables reassigned and others still `NULL`, no automatic
rollback. Worth wrapping in `db.transaction(...)` before it's actually run
against prod.

### 3.5 Migrations run inside the serverless app process on every cold start — `medium` — RESOLVED 2026-09-06 (VIK-88)
Migrations for Postgres now run as an explicit deploy step
(`vercel.json`'s `buildCommand` → `pnpm db:migrate`), not implicitly at
request time — see AGENTS.md's "Migrations" section for the full decision.
`lib/db/index.ts`'s real-Postgres path now fails closed
(`assertSchemaUpToDate`) instead of migrating mid-request. This was
elevated from "worth deciding" to "decided" by the VIK-76 incident, which
is exactly the concurrent-cold-start-race scenario this finding warned
about.

### 3.6 Mobile has zero static analysis — `medium` — RESOLVED 2026-09-05 (VIK-87)
`mobile/` now has a real `eslint.config.js` (`eslint-config-expo/flat`), a
`lint` script, and its own "Mobile lint" CI step — see `specs/
mobile-dashboard-view.md`'s "Further Notes" for what was adopted and what
was deliberately left out. Note the preset is not type-aware
(no `parserOptions.project`), so `@typescript-eslint/no-floating-promises`
is not active — 3.7 below is still an open, undetected gap despite this
fix.

### 3.7 Mobile: unhandled promise rejections can trap the user on the loading spinner forever — `medium`
`mobile/App.tsx:31-34` — `loadConfig().then(setConfig)` and
`loadStatus().then(setStatus)` have no `.catch`; `mobile/src/config.ts:15-16,
44-45` do `JSON.parse(raw)` with no try/catch. Corrupted/partial AsyncStorage
JSON (killed mid-write, etc.) throws, the promise rejects unhandled, state
never sets, and the app is stuck on `ActivityIndicator` forever with no
error message and no recovery short of clearing app storage.

### 3.8 No `pnpm` script for `scripts/backfill-accounts.ts` — `medium`, given imminent use
`seed.ts` gets a blessed `pnpm seed` entry; `backfill-accounts.ts` is only
documented via a hand-typed multi-env-var `node --import tsx ...` command in
its own docstring. This is specifically the script `HANDOFF.md` says still
needs to run against production before the `v3-generalized` merge — worst
script in the repo to leave without a canonical, low-typo invocation path.

---

## 4. Duplication / maintainability

### 4.1 Prescription-extraction logic duplicated near-verbatim between two routes
`app/api/documents/route.ts:118-151` and `app/api/documents/[id]/reprocess/
route.ts:29-62` both build the same ~25-line `extraction.prescriptions.map(...)`
→ `protocols` insert block. Two copies of the same business logic drift —
already nearly happened this session (easy to add a field like `accountId`
to one and forget the other). Worth extracting to a shared
`lib/protocols.ts` helper. `medium`.

### 4.2 `app/api/ingest/[type]/route.ts`'s 6-case switch duplicates the insert/update values object per record type
Lines ~57-193 — each of the 6 cases (`nutrition`, `weight`, `hydration`,
`sleep`, `exercise`, `activity`) repeats the same "build a `values` object,
`insert().onConflictDoUpdate({set: values})`" shape with the values object
often written out twice (once for insert, once for the conflict `set`).
Adding a 7th ingest type means copy-pasting another ~15-line block. `medium`.

### 4.3 AI response-text extraction duplicated 3x
The exact same
`response.content.filter(b => b.type === "text").map(b => b.text).join("\n")`
appears at `lib/ai/analysis.ts:56-59`, `lib/ai/analysis.ts:184-187`, and
`lib/rag.ts:179-182`; `max_tokens: 16000, thinking: { type: "adaptive" }` is
repeated at all four `messages.create` call sites. Natural home:
`lib/ai/client.ts`. `low`.

### 4.4 `lib/dates.ts` re-implements `YYYY-MM-DD` parsing 4 times, unvalidated
`addDays` (28-32), `mondayOf` (35-41), `daysBetween` (49-55), `shortLabel`
(58-66) each do `isoDate.split("-").map(Number)` independently, none
validating the input shape. A malformed string produces `NaN` components
that surface later as an opaque `RangeError`/"Invalid Date", far from the
actual bad input. This is a load-bearing utility (every day-bucketing
computation runs through it) worth centralizing and validating once. `low`.

### 4.5 Frontend: same fetch/loading/error-state shape hand-rolled independently per page
`app/check-in/page.tsx`, `app/settings/page.tsx`, `app/chat/page.tsx`,
`app/documents/page.tsx`, `components/WeeklyAnalysis.tsx` — 5+ near-identical
copies of the `busy`/`note-or-error`/try-catch-finally pattern, plus the
`err instanceof Error ? err.message : "<fallback>"` idiom appearing ~15
times app-wide (and 3 more times in mobile: `App.tsx:60,76`,
`src/sync.ts:150`). No shared hook/helper. `medium`.

### 4.6 Frontend: two incompatible ad-hoc "labeled form field" helpers
`app/check-in/page.tsx`'s `manualField()` (141-166) and
`app/settings/page.tsx`'s `text()`/`num()` (74-109) solve the same problem
with different APIs, redefined as inline closures on every render. A UI
tweak (e.g. validation styling) has to be made twice, inconsistently.
`medium`.

### 4.7 `fmtDate` duplicated verbatim between chart components
`components/WeightChart.tsx:21-24` and `components/ComplianceChart.tsx:27-30`
define the identical private date formatter. Belongs in `lib/dates.ts` or a
shared chart-utils module. `low`.

### 4.8 `app/check-in/page.tsx`'s `shiftWeek` reimplements `lib/dates.ts`'s `addDays`
Lines 29-33 are the same parse/`Date.UTC`/slice pattern as the already-
exported `addDays()`. Could just be `addDays(weekStart, weeks * 7)`. `low`.

### 4.9 Test helper boilerplate copy-pasted across 4 test files
`tests/checkins-route.test.ts`, `tests/settings-route.test.ts`,
`tests/stats.test.ts`, `tests/session-route.test.ts` each independently
define their own `makeAccount()`, their own `createdAccountIds`/`afterEach`
cleanup (manually listing child tables in FK order per 3.2), and 2 of 4
their own `requestWithSession()`. No shared `tests/helpers.ts` — and the
child-table cleanup lists already aren't consistent between files. `medium`.

### 4.10 Mobile: record-mapping boundary opts out of TypeScript entirely
`mobile/src/mapper.ts:8` — `type AnyRecord = Record<string, any>` for the
whole module; `mobile/src/healthConnect.ts:46-50` defaults to an untyped
shape too. This is the most safety-critical boundary in the
mobile app (raw native SDK output → server wire contract) with zero
compile-time protection — a `react-native-health-connect` version bump
renaming a field would silently produce `undefined`/`NaN` instead of a type
error, feeding straight into 2.2's poison-pill risk. `medium`.

---

## 5. Frontend / UX gaps

(`components/*.tsx` and the client-page shells in `app/**/page.tsx`. Doesn't
include the already-tracked "no client page handles a 401" gap —
see `HANDOFF.md`.)

### 5.1 Initial data-load fetches never check `res.ok` — `high`
`app/documents/page.tsx:47-55`, `app/chat/page.tsx:52-56`,
`app/settings/page.tsx:29-36`, `app/check-in/page.tsx:49-65` — all do
`fetch(url).then(r => r.json())` and pipe the parsed body straight into
`setState`, no `.ok` check, no `.catch`. Any non-2xx (500, validation error,
network blip) either renders error-shaped JSON as if it were real data, or
throws an unhandled rejection, leaving the page stuck on loading/empty with
zero user feedback.

### 5.2 Documents/Chat pages: empty state is indistinguishable from still-loading — `medium`
`app/documents/page.tsx:39-59`, `app/chat/page.tsx:46,52-56` initialize
state to `[]` and render immediately, unlike check-in/settings which gate on
`data !== null`. A returning user with real data briefly sees "you have
nothing" messaging on a slow connection.

### 5.3 Mutating buttons have no busy/disabled guard — `medium`
`app/documents/page.tsx:229-240` (Confirm/Reject), `:288-293` (re-run AI /
delete) — no `disabled` tied to in-flight state, unlike the upload form's
button which does this correctly. Double-clicking can fire duplicate
protocol confirmations or duplicate (costly) AI reprocessing jobs.

### 5.4 Optimistic chat message never rolled back on send failure — `medium`
`app/chat/page.tsx:69-88` — appends a user bubble before the request
resolves; on failure only sets `error`, never removes/marks the bubble. The
message looks sent but wasn't, with no "failed" indicator, and will vanish
silently on next reload.

### 5.5 No `aria-current` on active nav link; zero `aria-*` usage app-wide — `low-medium`
`components/NavLinks.tsx:14-36` — active state is color-only. Cheap,
high-leverage a11y fix.

### 5.6 Data tables have no horizontal-scroll wrapper — `low`
`app/documents/page.tsx:260-304,314-356` — 5-6 column tables with no
`overflow-x-auto`, inconsistent with the rest of the layout's responsive
handling.

### 5.7 Raw backend error strings surfaced directly to end users — `low`
E.g. `app/check-in/page.tsx:88-92,111-115`, `app/documents/page.tsx:74,
101-102`, `components/WeeklyAnalysis.tsx:26-29` all display `json.error ??
"<fallback>"` verbatim, and some API routes embed raw exception messages
into user-facing strings (`app/api/documents/route.ts:160,170`). Low risk
for a single-operator app; worth tracking if it's ever opened to more users.

### 5.8 Demo passcode shipped via a `NEXT_PUBLIC_PASSWORD`-named env var — `low`
`app/login/page.tsx:9` reads `NEXT_PUBLIC_DEMO_PASSWORD`, which Next.js
inlines client-side. Intentional and harmless today (the value is already
shown on the login screen), but the `NEXT_PUBLIC_` + "PASSWORD" naming
pattern is a footgun if ever reused for a real credential.

---

## 6. Mobile-specific (remaining items not covered above)

### 6.1 Weak, non-cryptographic device ID — `low`
`mobile/src/config.ts:20` — `Math.random().toString(36).slice(2, 8)` (6
base-36 chars) used as a durable data-provenance key across the whole
ingest pipeline.

### 6.2 No Server URL validation in the setup screen — `low`
`mobile/App.tsx:92-101` — freeform text input, no scheme/format check; a
scheme-less value fails later with an opaque low-level fetch error instead
of an inline validation message.

### 6.3 `TASK_NAME` hand-duplicated between source and test — `low`
`mobile/src/background.ts:8` (not exported) vs `mobile/test/
background.test.ts:17` (re-typed by hand). Low risk (a rename fails the
test loudly) but avoidable.

### 6.4 Inconsistent dependency pinning — `low`
`mobile/package.json:14-20` pins everything with `~` (patch-only) except
`react-native-health-connect` (`^3.5.0`, line 21) — the one native module
most likely to introduce build-breaking/ABI changes is the one allowed to
drift on minor versions.

### 6.5 Embeddings retry loop has no request timeout — `medium`
`lib/ai/embeddings.ts:24-46` — `MAX_ATTEMPTS = 4` and a `22_000 * attempt`
backoff are reasonable but unconfigurable/unexplained, and there's no
`AbortController`/timeout on the underlying `fetch`. A stalled (not
rate-limited, just hanging) Voyage response blocks for as long as the
platform allows (`maxDuration = 300`) instead of failing fast into the
existing "best effort" catch blocks.

---

## 7. Low-priority grab bag

- **`lib/db/schema.ts` unique-index naming is inconsistent** with table
  names (`workouts` → `workout_hc_uid_idx`, `sleep_sessions` →
  `sleep_hc_uid_idx`, `daily_activity` → `activity_*_idx`, vs.
  `nutrition_entries`/`weight_entries`/`hydration_entries` → consistently
  drop "entries"). Cosmetic, but makes index names unpredictable when
  grepping migrations/`EXPLAIN` output.
- **`@types/node` is pinned to `^20`** while `engines.node`/`.nvmrc`/CI all
  target Node 22 (`package.json`) — TypeScript checks against the wrong
  Node API surface. Cheap fix: bump to `^22`.
- **`lib/env.ts` does no startup validation** of any env var (shape,
  minimum length for secrets, etc.) — misconfiguration is discovered at
  first runtime API call via an opaque error, not at boot.
- **`lib/db/index.ts` resolves `process.cwd()` independently in two
  places** (PGlite data dir, migrations folder) rather than once via
  `lib/env.ts`. Fine as long as everything's invoked from the repo root
  (true today).
- **`scripts/check-tdd-pairing.sh`'s source-changed pattern doesn't cover
  `scripts/*`** — `scripts/seed.ts` has substantial non-delegated logic
  (data generation, the `SEED_AI` branch) that can change without
  triggering the "needs a paired test" gate.
- **`tests/backfill-accounts.test.ts` creates real "Test Vik"/"Test
  Spouse" accounts with no cleanup** — harmless for CI (fresh DB), but
  they persist permanently in the shared local `.data/pglite` dev database
  alongside real seed/demo data.
- **README.md:29 still says "next competition"** in the check-in feature
  description — one leftover bodybuilding-era term the terminology sweep
  missed (see AGENTS.md's "what not to do" list).
- **`scripts/seed.ts:362`'s `as any`** in the generic upsert helper — has
  an eslint-disable already, pre-existing, genuinely awkward to type
  around a shared helper over 5 different table types. Not urgent.

---

## How this was produced

Compiled from: a manual review of every `app/api/*` route (surfaced 1.1,
1.2, 1.3, and the `app/api/protocols`/`documents/[id]` gaps specifically),
plus four parallel audits of `mobile/`, `lib/ai`+`lib/ingest`+`lib/rag.ts`,
`components/`+client pages, and build/CI/test infra. Deliberately excludes
pure style/formatting nits and anything a linter already catches.
