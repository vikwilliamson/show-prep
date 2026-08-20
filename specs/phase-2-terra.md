# Phase 2 — Health Data Bus (Terra) — Build Spec

**Source:** `specs/v3-build-spec.md`'s Phase 2 section, refined here with
current Terra API documentation (`docs.tryterra.co`, checked 2026-08-19) and
against what actually exists in the codebase post-Phase-1
(`feat/phase-1-account-scoping`, merged into `v3-generalized`).
**This pass covers:** replacing the current direct-Health-Connect mobile
ingest pipeline with Terra as the unified health-data layer — pseudonymized
identity, backend webhook receiver, mobile SDK integration, web-only OAuth
providers, consent flow, and a manual-entry fallback that doesn't actually
exist yet (see "Corrections to the parent spec" below).
**Effort:** `xhigh` per `CLAUDE.md` — this touches the data model (new
webhook-sourced tables/columns) and is the widest-blast-radius phase so far:
it replaces the mobile app's entire data-collection mechanism, not just a
route.

---

## Status — gates before real implementation starts

| Gate | Status |
|---|---|
| Terra compliance confirmation email | Drafted (`specs/terra-compliance-email-draft.md`), not yet sent — Vik's action |
| Terra API credentials (`TERRA_API_KEY`, dev ID, webhook signing secret) | Not yet added to env — Vik's action, in progress |
| Terra Mobile SDK + Expo `prebuild` compatibility spike | **Not started** — recommended first code-adjacent step once credentials exist, see `HANDOFF.md` |

Nothing in "What can start now" below is blocked by these — it's spec/
scaffolding work. Everything under "Blocked until credentials exist" needs
at least a Terra sandbox account to build against meaningfully; writing it
against no real endpoint risks guessing wrong about response shapes.

## Corrections to the parent spec (found while re-reading it against the current codebase)

- **"Keep the existing manual entry form" (item 5) — there isn't one.**
  `source` is a column with a `"manual"` default across every health table
  (`lib/db/schema.ts`), but no page or API route lets a user actually type in
  a weight/nutrition/sleep entry today — all current data entry is via the
  mobile ingest API or `scripts/seed.ts`. This needs to be *built*, not kept.
  Small in isolation, but real scope the parent spec undercounts.
- **Several `TECH_DEBT.md` mobile findings become moot once this ships, not
  worth fixing first.** §2.2 (weight-sync poison pill), §2.6 (sleep stages
  as raw integers), §4.10 (mapper.ts's untyped `any` boundary), §1.6
  (plaintext AsyncStorage token), §1.7 (cleartext HTTP) are all in
  `mobile/src/mapper.ts`/`config.ts`/the direct-Health-Connect sync path —
  code this phase deletes and replaces with Terra's SDK. Don't spend time on
  them; if the Terra SDK spike stalls and this phase gets deprioritized,
  revisit whether they're still worth fixing on the old path.
- **`TECH_DEBT.md` §1.3 (ingest tables' unique indexes aren't
  account-scoped) is this phase's problem to actually fix**, not defer
  further — new Terra-sourced rows need real `account_id` values from day
  one (via the pseudonymous `reference_id` → `accounts.id` lookup), at which
  point the existing `*_hc_uid_idx`/`activity_local_date_idx` indexes need
  to become account-scoped or the collision risk becomes live instead of
  latent.

---

## 0. Pseudonymized identity layer — mostly already in place

`accounts.referenceId` (uuid, unique, `defaultRandom()`) already exists —
added in `feat/client-account-foundation` specifically so this phase
wouldn't need its own ID-generation step (see `specs/client-accounts.md`).
What's actually left here:

- [ ] A `getAccountByReferenceId(referenceId)` lookup helper (`lib/auth.ts`
      or a new `lib/terra.ts`) — the webhook receiver's only way to map an
      inbound Terra payload's `reference_id` back to an internal
      `account_id`.
- [ ] The audit the parent spec calls for: grep every place a Terra
      SDK/API call gets constructed once that code exists, confirm the only
      identifier ever passed is `account.referenceId` — never `name`,
      `email`, or anything else off the `accounts` row. Do this right before
      the first real (non-sandbox) connection, not just once at the start.

## 1. Backend webhook receiver

New `POST /api/health-webhook`, replacing `app/api/ingest/[type]/route.ts`
(per `HANDOFF.md`'s existing note: "don't patch the doomed one, replace it
there").

- **Signature verification**: Terra signs webhooks with HMAC-SHA256 in a
  `terra-signature` header, format `t=<timestamp>,v1=<signature>` — verify
  using the endpoint's signing secret (new `TERRA_WEBHOOK_SECRET` env var).
  Terra's docs recommend their official verification library over a
  hand-rolled implementation; use it if a Node/TS one exists, otherwise
  implement per their documented algorithm (HMAC-SHA256 over the raw
  request body — do **not** let any body-parsing middleware normalize/
  re-serialize it first, or verification breaks).
- **Payload normalization**: map Terra's per-provider payload shapes into
  the app's existing `WeekStats`-feeding tables (`nutrition_entries`,
  `weight_entries`, `hydration_entries`, `workouts`, `sleep_sessions`,
  `daily_activity`) rather than inventing a parallel schema — `lib/stats.ts`
  already reads from these and is now account-scoped; reuse that surface.
  Terra's payloads are richer than what these tables model today (heart
  rate, VO2 max, blood oxygen, stress scores, etc., depending on provider) —
  **decide explicitly** whether to drop unmodeled fields, add new columns
  for the ones worth keeping, or add a JSONB catch-all for forward
  compatibility. Don't let this get decided implicitly by whatever the
  first implementation happens to touch. Also unverified from Terra's docs
  as of this writing: whether payloads are per-event records or daily
  aggregates — confirm against a real sandbox payload before finalizing the
  normalization logic, since that changes what "idempotent" even means here.
- **`source` value convention**: the existing tables' `source` column is a
  de facto enum (`myfitnesspal`, `samsung_health`, `csv_backfill`,
  `manual`), not schema-enforced. Decide Terra rows' value(s) deliberately
  (e.g. `terra` generically, or per-provider like `terra_fitbit`) rather
  than defaulting to whatever string feels natural at implementation time —
  low risk today since nothing branches on `source` in the UI, but still
  worth being intentional given it's the one column every future "where did
  this data come from" question will read.
- **`hc_uid` is a naming problem, not just an indexing one.** The column is
  literally named for Health Connect's ID scheme ("hc_uid" = Health Connect
  UID). Terra has its own, differently-shaped per-record identifier —
  reusing `hc_uid` to mean "whatever the current provider calls its ID" is
  exactly the kind of naming-survives-past-its-meaning smell that makes a
  schema harder to read later. Rename the column (e.g. `provider_uid` or
  `external_uid`) as part of this phase's migration rather than silently
  repurposing it.
- **Input validation**: `TECH_DEBT.md` §2.7 flagged the current ingest
  schemas as having no upper bounds on numbers/string lengths. Don't carry
  that gap into the new webhook's zod schemas — get sane bounds right from
  the start rather than fixing it later as its own tech-debt item.
- **Idempotency**: Terra may redeliver on retry. The parent spec suggests
  deduping on `(client_id, source, type, start, end)`; the existing tables'
  `hc_uid`-equivalent unique-index pattern serves the same purpose today.
  Decide whether to keep a per-record-ID unique index (renamed per above)
  or switch to the composite-key approach — either way, the index needs to
  be account-scoped from the start (see "Corrections" above).
- **`account_id` resolution**: every inbound payload carries the
  `reference_id` you set at connection time — resolve it to `account_id` via
  the 0. lookup helper before any insert. No fallback-to-primary-coach
  pattern here (unlike the interim `getPrimaryCoachAccountId()` Phase 1 used
  for the old ingest route) — a payload with an unresolvable `reference_id`
  should be rejected/logged, not silently attributed to the wrong account.

## 2. Web-only providers (Fitbit, Garmin, MyFitnessPal)

Terra's OAuth connect flow, initiated from the Next.js backend, no mobile
app involved. New route(s) under `app/api/terra/connect` (or similar) to
generate the auth widget URL with `reference_id` set, plus a callback route
to handle the redirect. Data lands at the same `/api/health-webhook` as
mobile-SDK sources — no separate handling needed once webhooks are unified.

## 3. Mobile-SDK providers (Apple Health, Google Health, Samsung Health)

The big one — replaces `mobile/src/mapper.ts`, `healthConnect.ts`,
`sync.ts`, `background.ts` (the entire custom Health-Connect-direct sync
engine) with Terra's Mobile SDK and a call to `initConnection()` carrying
the account's `reference_id`.

**Do the Expo/Terra compatibility spike before committing to this.** Per
`HANDOFF.md`: confirm Terra's Mobile SDK (React Native) actually works with
this app's `expo prebuild` setup before writing the full integration. If it
doesn't, that changes this section's approach significantly (bare workflow
migration, a dev client, etc.) — worth knowing early, not after building
most of the mobile-side work.

## 4. Consent flow

Plain-language screen — what data is collected, that it passes through
Terra as a processor, where it's stored — with explicit acknowledgment
required before the connect flow starts. Applies to every account,
including Vik and spouse as first testers, no exceptions per the parent
spec. Small UI lift; sequence it before any real account (including
internal testers) hits `initConnection()` or the OAuth widget.

## 5. Manual entry fallback (new work — see "Corrections" above)

A simple form (weight, a day's macro totals, sleep hours, water) that
writes directly to the existing tables with `source: "manual"`. Default
path when nothing's connected; also useful as a correction/backfill tool
once Terra is live. Doesn't depend on Terra credentials — could be built in
parallel with anything else in this phase.

---

## Explicitly deferred (per parent spec, unchanged)

- Twilio SMS client chat.
- Multi-tenant/external API packaging for telehealth partners.
- Formal HIPAA/SOC 2 audit engineering.
- Terra Enterprise + BAA — until a covered entity (e.g. a signed telehealth
  partner) is actually in the data chain. The compliance email +
  pseudonymized-ID architecture is the operating approach until then.

## Recommended sequencing

1. Send the compliance email (drafted, `specs/terra-compliance-email-draft.md`).
2. Add Terra credentials to env once signed up.
3. Time-boxed Expo/Terra Mobile SDK compatibility spike (§3) — informs
   whether §3 is a moderate integration or a bigger Expo-workflow change.
4. Backend webhook receiver (§1) + the `account_id` lookup helper (§0) —
   buildable/testable against Terra's sandbox independent of the mobile
   spike's outcome.
5. Manual entry form (§5) — no dependency on any of the above, could slot
   in anywhere, including right now.
6. Mobile SDK integration (§3 proper) once the spike confirms an approach.
7. Web-only OAuth providers (§2) — lowest-risk, most isolated piece; fine to
   do last.
8. Consent flow (§4) — must land before step 6 or 2 actually connects a
   real account, but the UI itself has no hard ordering dependency on the
   others.

## Test plan (TDD — write these first, per repo convention)

- Webhook signature verification: valid signature accepted, tampered/
  missing signature rejected, using a fixture payload + known secret (don't
  hit Terra's actual servers in tests).
- `reference_id` → `account_id` resolution: known reference_id resolves,
  unknown one is rejected/logged, not silently dropped or misattributed.
- Payload normalization: one fixture payload per provider/data type →
  correct row in the corresponding table, tagged with the right
  `account_id`.
- Idempotency: redelivering the same payload doesn't duplicate rows.
- Manual entry form: submits land in the right table with `source:
  "manual"` and the submitting account's `account_id`.
