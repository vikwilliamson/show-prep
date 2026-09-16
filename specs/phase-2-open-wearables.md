# Phase 2 — Health Data Aggregator (Open Wearables) — Build Spec

**Source:** `specs/phase-2-terra.md` (predecessor, written for Terra before
the 2026-08-19 vendor pivot) plus the Open Wearables spike's real findings
(VIK-11 environment, VIK-12 nutrition-coverage spike, VIK-13 webhook-maturity
spike, both closed 2026-09-08). Section numbering below is kept parallel to
the Terra spec on purpose, for diffability against what changed and what
didn't.
**This pass covers:** replacing the mobile app's remaining direct-Health-
Connect pipeline (weight, hydration, sleep, exercise/workouts, daily
activity — everything except nutrition) with Open Wearables' RN SDK on both
iOS and Android; the backend webhook receiver; self-hosting Open Wearables
itself; the consent flow; the manual-entry fallback the Terra spec correctly
identified as missing and which still doesn't exist.
**Doesn't cover:** nutrition/macro ingestion. VIK-12's spike found this is
**not implemented in Open Wearables on either platform** — a `Meal`/`Macros`
response schema exists in its backend but is never wired to any route,
provider mapping, or webhook event; Android's own SDK reference docs don't
even expose macro/calorie capture types, only water. `specs/
phase-2-nutrition.md` covers that gap with a separate, already-partly-shipped
direct pipeline. Don't duplicate that work here, and don't fold nutrition
back into this spec if Open Wearables ever ships it upstream — cross that
bridge if/when it happens (same call `phase-2-nutrition.md` already made).
**Effort:** `xhigh` per `CLAUDE.md` — touches the data model (`hc_uid` →
`provider_uid` rename across five tables, new webhook-sourced provenance)
and is the widest-blast-radius remaining piece of Phase 2.

---

## Status — gates before real implementation starts

| Gate | Status |
|---|---|
| Local spike environment (VIK-11) | Done |
| Webhook maturity spike (VIK-13) | Done — **outcome: build the receiver, don't poll** (see §1) |
| Nutrition-coverage spike (VIK-12) | Done — **outcome: not covered by Open Wearables on either platform**, split into `specs/phase-2-nutrition.md` |
| Self-hosted deployment (Railway/Fly/Render) | Not started |
| `OUTGOING_WEBHOOKS_ENABLED=true` + dedicated `svix-server` + its own Postgres, in the real deployment | Not started |
| Live end-to-end webhook delivery smoke test | **Not done.** VIK-13 confirmed event-type registration against Svix works and the API surface is real, but never confirmed an actual payload lands on a receiver end to end — do this before calling §1 done, not just registration |
| Hydration/water webhook coverage | **Resolved (2026-09-16) — Android yes, iOS no.** See §1 |

## Corrections to the `phase-2-terra.md` predecessor

- **Vendor is Open Wearables, self-hosted — not Terra.** Every Terra-specific
  detail below (SDK name, signing mechanism, pricing) is new; the
  requirements shape (signature verification, `reference_id` resolution,
  normalization, idempotency, consent, manual entry) is unchanged, which is
  why this spec keeps the same section numbers.
- **§0 (pseudonymized identity layer) is now fully done, not "mostly."**
  `getAccountByReferenceId()` already landed in `lib/auth.ts` as part of the
  direct-nutrition-ingest work (`specs/phase-2-nutrition.md` §1) and is
  already exercised in production by `app/api/ingest/[type]/route.ts`. The
  webhook receiver reuses it verbatim — no new lookup helper to build.
- **Nutrition is explicitly out of scope now**, confirmed absent from Open
  Wearables rather than merely deferred — see `specs/phase-2-nutrition.md`.
- **The manual-entry-fallback gap the Terra spec identified is still open.**
  Nothing has built it since; carries forward unchanged (§5).
- **The `hc_uid` → `provider_uid` rename the Terra spec called for was never
  done** — still `hc_uid` across all five remaining ingest tables per
  `lib/db/schema.ts`. Still applies, now against Open Wearables' own
  per-record identifiers instead of Terra's.
- **Self-hosting changes the infra story materially versus a SaaS vendor.**
  This is a new deployed service (FastAPI/Postgres/Redis/Celery via Docker
  Compose) on Railway/Fly/Render, not a Vercel-hosted API integration — see
  §2 below, which has no equivalent in the Terra spec.

---

## 0. Pseudonymized identity layer — done, reuse as-is

`accounts.referenceId` and `getAccountByReferenceId()` (`lib/auth.ts`)
already exist and are already live in production via the direct-ingest
route. The webhook receiver calls the same helper — no new identity code
needed here. The one remaining item from the Terra spec: re-run the "grep
every place a reference_id gets sent, confirm it's the only identifier ever
passed" audit once the Open Wearables connect flow (§3) actually exists —
do it right before the first real (non-sandbox) connection, not just once
now.

## 1. Backend webhook receiver

New `POST /api/health-webhook` (keep the vendor-neutral name from the
original scoping — it already doesn't say "terra" or "open-wearables",
which is exactly right if the vendor ever changes again).

- **Infra prerequisite**: outgoing webhooks are disabled by default on Open
  Wearables (`OUTGOING_WEBHOOKS_ENABLED=true` required) and require a
  dedicated `svix-server` container plus its own Postgres database, separate
  from Open Wearables' primary app DB (VIK-13 finding) — a real piece of
  infrastructure to provision, not a config flag alone. See §2.
- **Signature verification**: Open Wearables delivers via
  [Svix](https://svix.com/), not a hand-rolled HMAC scheme — verify using
  Svix's official Node SDK (`svix` on npm) and its `Webhook` verification
  helper against the `svix-id`/`svix-timestamp`/`svix-signature` headers,
  rather than reimplementing HMAC-SHA256 by hand. As with the Terra spec's
  version of this requirement: do not let any body-parsing middleware
  normalize/re-serialize the raw request body before verification runs, or
  it breaks.
- **Idempotency — two layers, both needed**:
  - *Message-level*: `svix-id` is stable across Svix's own retries — track
    processed `svix-id`s to no-op a full redelivery.
  - *Record-level*: a single webhook payload can carry a full sample array
    (large batches auto-chunk at 2,500 samples to stay under Svix's 1MB
    limit), so message-level dedup alone doesn't cover duplicate records
    *within or across* payloads — still need the Terra spec's per-record
    unique-index approach (`hc_uid`/`provider_uid`, account-scoped) for
    correctness inside a batch.
- **Payload normalization**: map event payloads into the five (not six —
  nutrition excluded) existing tables: `weightEntries`, `hydrationEntries`,
  `sleepSessions`, `workouts`, `dailyActivity`. Reuse `lib/stats.ts`'s
  existing read surface unchanged.
  - Confirmed event-type mapping, per VIK-13's spike of the event catalog:
    `sleep.created` → `sleepSessions`, `workout.created` → `workouts`,
    `activity.created` plus the steps/calories timeseries groups →
    `dailyActivity`, a body-composition timeseries group → `weightEntries`.
  - **Resolved 2026-09-16 — hydration is real and independent of the dead
    nutrition schema, but Android-only.** Checked the local Open Wearables
    checkout (`open-wearables-spike/`, same `d9a64bf` clone VIK-12/13 used)
    directly rather than relying on docs:
    - Android/Health Connect's `HYDRATION` record type is its own first-class
      SDK metric (`SDKMetricType.ANDROID_HYDRATION`,
      `backend/app/constants/series_types/sdk/metric_types.py:131`), mapped
      to `SeriesType.hydration` and wired to a dedicated, real webhook event
      — `series.hydration.created`
      (`backend/app/schemas/webhooks/event_types.py:149`,
      `backend/app/constants/webhooks/events.py:175`). This is a completely
      separate code path from the orphaned `Meal`/`Macros` nutrition schema
      VIK-12 found dead — `hydrationEntries` is **not** affected by that gap
      and stays in scope for this spec, at least for Android.
    - **iOS has no equivalent.** `grep -rn -i "water" backend/app/services/
      apple` and a repo-wide search for `DietaryWater`/`dietary_water`
      return nothing — HealthKit's `HKQuantityTypeIdentifierDietaryWater` is
      never referenced anywhere in the backend. This matches VIK-12's
      broader finding that HealthKit's entire `Dietary*` family is
      unmapped, not a separate gap.
    - **Net: hydration is asymmetric across platforms, same shape as the
      nutrition gap.** Android hydration → `hydrationEntries` via this
      spec's webhook receiver, works today. iOS hydration has no path
      through Open Wearables at all — either accept "no iOS hydration for
      now" or fold it into `specs/phase-2-nutrition.md`'s iOS HealthKit
      spike (§3 there) as one more `Dietary*`-adjacent type to capture
      directly, the same way that spec is already doing for
      protein/carbs/fat/calories. Recommend the latter, decided when that
      spec's iOS spike is scoped, not here — don't let this spec block on
      it.
  - `menstrual_cycle.created` has no corresponding table today — out of
    scope; note it for a future ticket if the product ever wants it, don't
    build speculatively.
- **`source` value convention**: decide deliberately (e.g. `open_wearables`,
  or per-underlying-provider like `open_wearables_healthkit`) — same "don't
  default to whatever's convenient" guidance the Terra spec gave, still
  applies, still nothing branches on it in the UI today.
- **`account_id` resolution**: `getAccountByReferenceId()`, reject an
  unresolvable `reference_id` rather than falling back to any default
  account. Confirm Open Wearables' connection-time API accepts an opaque
  external ID the same way Terra's did — if its field is named differently,
  that's a one-line adapter, not a design change.

## 2. Self-hosted deployment (new — no equivalent in `phase-2-terra.md`)

- Deploy Open Wearables (FastAPI + Postgres + Redis + Celery, Docker
  Compose) to a small persistent host — Railway/Fly/Render, not Vercel (per
  `HANDOFF.md`'s Phase 2 status reasoning; plausibly under $50/mo at pilot
  scale).
- Compliance-boundary responsibility shifts to us, unlike a SaaS vendor:
  HTTPS, network-isolated Postgres/Redis, an image-patching cadence,
  backups, a written incident-response answer. Real work, bounded at 5-user
  pilot scale — not a blocker, but don't skip it because "it's just a
  Docker Compose file."
- Stand up the dedicated `svix-server` + its own Postgres for outgoing
  webhooks, separate from Open Wearables' primary app database.
  `OUTGOING_WEBHOOKS_ENABLED=true` in the deployed environment.
- Run the event-type seeding step (`seed_webhook_event_types.py` or its
  production equivalent) to register event types against the live Svix
  instance.
- **Do the live end-to-end delivery smoke test VIK-13 flagged as
  unconfirmed** before considering §1 done: register a real endpoint
  (`webhook.site`/`ngrok`/the real receiver once it exists), fire a
  `.../test` event, confirm it actually arrives — not just that event-type
  registration succeeded against Svix.

## 3. Mobile SDK integration

Open Wearables' Expo-Module-API React Native SDK, covering HealthKit +
Samsung Health + Health Connect in one API. Replaces `mobile/src`'s entire
custom sync engine (`mapper.ts`, `healthConnect.ts`, `sync.ts`,
`background.ts`) for every data type **except nutrition**, which
`specs/phase-2-nutrition.md`'s narrowed direct pipeline keeps running
alongside it — two pipelines by design, not overlap to reconcile later (see
that spec's "Why nutrition-only, not the whole old pipeline" section). The
connect call carries the account's `reference_id` — confirm the SDK's actual
parameter name against its own docs before assuming it matches Terra's
`initConnection()` naming.

## 4. Consent flow

Same shape as the Terra spec's §4 — plain-language screen (what's collected,
that it passes through the aggregator as a processor, where it's stored),
explicit acknowledgment before the connect flow starts, applies to every
account with no exceptions. Keep the copy vendor-neutral per `specs/prd.md`'s
explicit instruction not to hardcode a vendor name into product copy. No
design change from the predecessor.

## 5. Manual entry fallback (carried forward, still not built)

Unchanged from the Terra spec's §5 — this still doesn't exist anywhere in
the codebase. A simple form (weight, sleep hours, water, daily activity —
**not** macros/nutrition, which is `phase-2-nutrition.md`'s own concern if a
manual form gets built there too) writing directly to the existing tables
with `source: "manual"`. No dependency on anything else in this spec;
buildable in parallel with any of it.

---

## Explicitly deferred

- Twilio SMS client chat, multi-tenant/telehealth API packaging, formal
  HIPAA/SOC 2 audit engineering — carried forward from the parent spec.
- Terra Enterprise + BAA — moot now that Terra isn't in the pipe; the real
  trigger for revisiting Terra at all is a future partner whose own vendor
  security review wants a company with a compliance program behind it, not
  pilot-scale risk (`HANDOFF.md`'s Phase 2 status reasoning).
- **A formal pluggable-health-data-source abstraction.** Vik's explicit call
  (`HANDOFF.md`'s Phase 2 status): stay loosely vendor-agnostic in
  naming/schema (the `provider_uid` rename) without building a formal
  pluggable-provider interface — matches this project's existing YAGNI
  pattern elsewhere (no multi-coach support until there's a second coach,
  etc.). Revisit only if a real second-vendor need appears.
- **Web-only OAuth-style providers** equivalent to Terra's Fitbit/Garmin/
  MyFitnessPal web connect. Confirm whether Open Wearables offers anything
  analogous before scoping a real ticket for it; if it's mobile-SDK-only,
  this Terra-spec item has no Open Wearables equivalent and should be
  dropped, not carried forward blind.

## Recommended sequencing

1. Self-hosted deployment (§2) — infra prerequisite for everything else;
   can start now, independent of any application code.
2. Backend webhook receiver (§1) — buildable/testable against the
   self-hosted instance once §2's environment is up. Covers weight,
   hydration (Android only — see §1), sleep, workouts, daily activity.
3. Live end-to-end delivery smoke test (§2) — required before §1/§2 count as
   done.
4. Manual entry fallback (§5) — no dependency on anything above; fine to
   slot in anytime, including right now, in parallel.
5. Mobile SDK integration (§3) — once §1 is confirmed working end to end.
6. Consent flow (§4) — must land before §3 (or anything else) connects a
   real account, but has no hard ordering dependency on the others otherwise.

## Test plan (TDD — write these first, per repo convention)

- Svix signature verification: valid signature accepted, tampered/missing
  signature rejected, using a fixture payload + known secret (don't hit a
  real Svix instance in tests).
- Message-level idempotency: redelivering the same `svix-id` no-ops.
- Record-level idempotency: two records sharing the same `provider_uid`,
  within one payload or across two, don't duplicate.
- `reference_id` → `account_id` resolution: known reference_id resolves,
  unknown one is rejected/logged, never misattributed — same shape as the
  existing coverage in `tests/ingest-route.test.ts`.
- Payload normalization: one fixture payload per confirmed event type →
  correct row in the corresponding table, tagged with the right
  `account_id`.
- Manual entry form: submits land in the right table with `source:
  "manual"` and the submitting account's `account_id`.
