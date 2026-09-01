# Phase 2 — Nutrition Sync (Direct, Alongside Open Wearables) — Build Spec

**Source:** VIK-11/12/13's Open Wearables spike (2026-08-20). Reading the
actual ingestion source (not the docs) found that neither Apple HealthKit
nor Android Health Connect nutrition/macro data is currently wired up in
Open Wearables — confirmed independently on GitHub: a contributor's
[PR #961](https://github.com/the-momentum/open-wearables/pull/961) attempted
exactly this fix for HealthKit and was closed without merging, with a
maintainer commenting *"the dietary types are not yet included in our
mappings... we do not yet know whether we want to handle dietary data in
this or different manner"* (2026-05-07); [issue #1181](https://github.com/the-momentum/open-wearables/issues/1181)
is an open, unanswered request for the same on Health Connect. No committed
timeline either way. Nutrition/macro tracking is a non-negotiable product
requirement — this spec builds it directly rather than waiting on a vendor
with no roadmap for it.
**This pass covers:** ingesting nutrition/macro data straight from
HealthKit (iOS) and Health Connect (Android) into Gamma's own
`nutrition_entries` pipeline — scoped to nutrition only, running alongside
whatever Open Wearables ends up covering for every other data type.
**Doesn't cover:** Open Wearables' own integration (separate spec,
`specs/phase-2-open-wearables.md`, not yet written — VIK-14) or reviving the
old pipeline's other five record types (weight, hydration, sleep, exercise,
activity). Those stay Open Wearables' job once that integration ships — see
"Why nutrition-only, not the whole old pipeline" below.
**Effort:** `xhigh` — the backend half touches an ingest table's unique
index (`nutrition_hc_uid_idx` → account-scoped), the same class of change
`CLAUDE.md` calls out as needing the higher bar.

---

## Why nutrition-only, not the whole old pipeline

`mobile/src/` already has a **complete, code-reviewed Android → Health
Connect → `nutrition_entries` path** — `mapNutrition()` (`mapper.ts:20`)
parses Health Connect's `Nutrition` record into exactly the
`/api/ingest/nutrition` wire shape, wired into `sync.ts`'s sync loop
already. It was built for the old (abandoned) direct-Health-Connect
architecture, before the decision to adopt Open Wearables. It's tempting to
just resurrect all of it (weight, hydration, sleep, exercise, activity too)
since the code already exists — **don't**. That reintroduces the exact
problem Open Wearables was chosen to solve: two systems independently
writing to the same tables (`weight_entries`, `sleep_sessions`, etc.) once
Open Wearables' own integration lands, with no reconciliation story. Scope
this pass to the one data type Open Wearables can't currently deliver on
either platform, and let Open Wearables own everything else once
`specs/phase-2-open-wearables.md` ships.

Practically: reuse `mapper.ts`'s `mapNutrition()` and `healthConnect.ts`'s
`readAll()`/init pattern (both platform-agnostic in shape, Android-specific
in implementation), but trim `sync.ts`'s `plans` array and `app.json`'s
Health Connect permissions down to `Nutrition` only — not the full six-type
list currently there.

## 1. Backend — fix what this pipeline needs regardless of platform

**Status: shipped** (`feat/nutrition-ingest-account-scoping`, PR into
`v3-generalized`). Summary of what landed, for reference:

- **§1.3 — every ingest table's unique index account-scoped, in full.**
  Migrated `nutrition_hc_uid_idx` from `uniqueIndex(t.hcUid)` to a composite
  `(accountId, hcUid)` index (`drizzle/0012`), same pattern already used for
  `check_ins`/`settings`/`weekly_targets` in `drizzle/0010`-`0011` — then,
  since the migration mechanism was already in hand, batched in the
  identical fix for the other five ingest tables in a follow-up commit
  (`drizzle/0013`): `weight_hc_uid_idx`, `hydration_hc_uid_idx`,
  `workout_hc_uid_idx`, `sleep_hc_uid_idx` → `(accountId, hcUid)`;
  `activity_hc_uid_idx` → `(accountId, hcUid)` and `activity_local_date_idx`
  → `(accountId, localDate)` (previously one activity row per day *globally*,
  the worst instance of this bug). `TECH_DEBT.md` §1.3 is now fully closed,
  not just the nutrition slice.
- **`app/api/ingest/[type]/route.ts` now resolves a real `accountId`.**
  Design landed: reuse `accounts.referenceId` (already exists, unique,
  originally added for Terra's pseudonymous-ID need — free to reuse since
  Terra's no longer the plan) as the identity field, resolved server-side
  via a new `getAccountByReferenceId()` helper in `lib/auth.ts`. The shared
  bearer token (`INGEST_API_KEY`) still gates "is this a legitimate
  companion client at all"; `referenceId` in the batch payload says *whose*
  data it is. An unresolvable `referenceId` is rejected (401), never
  silently attributed to a fallback account. Every insert across all six
  ingest types (plus `sync_log`) is now tagged with the resolved
  `accountId` — the identity-resolution fix is necessarily route-wide, not
  nutrition-specific, since it happens once before the type switch.
- **New test coverage** (`tests/ingest-route.test.ts`, previously zero):
  accountId tagging, unresolvable-referenceId rejection, two-account
  collision-avoidance (composite index), upsert-in-place, and bounds
  rejection. Plus `getAccountByReferenceId()` coverage in `tests/auth.test.ts`.
- Also fixed while in the neighborhood: `nutritionRecord`'s numeric fields
  now have upper bounds (`TECH_DEBT.md` §2.7 — calories ≤ 20,000, gram
  fields ≤ 2,000, sodium ≤ 50,000mg), and `lib/ingest/auth.ts`'s bearer
  comparison is now constant-time (`TECH_DEBT.md` §1.5).

### 2026-08-22 — companion pairing ID gap (VIK-19)

Discovered prepping VIK-16's real-device validation: §1's `referenceId`
requirement (a UUID, resolved server-side to an `accountId`, rejected with
401/422 if missing or unresolvable) was landed backend-only. Neither the
mobile companion (`config.ts`/`sync.ts`) nor the web app ever surfaced a
`referenceId` for a user to send — a fresh install 422s on the first sync,
full stop. Not scoped to §1 (backend) or §2 below (Android narrowing); it's
the gap between them.

Fixed as VIK-19: `getAccountReferenceId()` in `lib/auth.ts`, surfaced as a
read-only, copyable "Companion pairing ID" on the web Settings page
(`app/settings/page.tsx`), and a new `referenceId` field in the mobile
app's config screen sent on every sync. This is also the answer to "how
does a new tester get paired to their account" for product-testing
onboarding — copy the ID from Settings, paste it into the app once.

## 2. Android — validate and narrow the existing pipeline

Already built, never run against real hardware (`HANDOFF.md`). This pass:

- Narrow `healthConnect.ts`'s `RECORD_TYPES` and `app.json`'s
  `android.permissions` to `Nutrition` (+ `READ_HEALTH_DATA_HISTORY`) only
  — drop `Weight`/`Hydration`/`SleepSession`/`ExerciseSession`/`Steps`/
  `TotalCaloriesBurned` and their permissions.
- Narrow `sync.ts`'s `plans` array to the single nutrition entry;
  `background.ts` and `config.ts` need no changes (already generic).
- **Real-device validation** — install on a real Android phone with real
  MyFitnessPal data logged, confirm `mapNutrition()`'s assumptions hold
  (meal-type codes, zero-energy filtering, the hardcoded `source:
  "myfitnesspal"` label — worth double-checking that's still accurate now
  that the pipeline is nutrition-only, since any app writing to Health
  Connect's `Nutrition` type gets that same label today).

### 2026-08-27 — real-device validation done, three Android 14 gotchas (VIK-16)

Validated end-to-end on a Galaxy S25 (Android 15): MyFitnessPal → Health
Connect → Gamma Companion → `/api/ingest/nutrition` → shows correctly on
the web dashboard's Macro compliance panel. `mapNutrition()`'s assumptions
held (meal types, zero-energy filtering); `source: "myfitnesspal"` still
reads correctly since MFP is the only app currently writing to this
device's Health Connect Nutrition store.

Getting there took three follow-up fixes, none about the narrowing
itself — all pre-existing gaps in `react-native-health-connect` +
Expo's managed workflow that only a real device could surface:

1. **Crash on "Grant HC permissions"** — `kotlin.
   UninitializedPropertyAccessException`. `HealthConnectPermissionDelegate.
   setPermissionDelegate(this)` was never called; the library's own Expo
   config plugin only patches `AndroidManifest.xml`, not `MainActivity`.
   Fixed with a custom plugin (`mobile/plugins/
   withHealthConnectPermissionDelegate.js`) injecting it via
   `withMainActivity`. Matches matinzd/react-native-health-connect#114,
   #117, #214.
2. **Permission request silently no-ops** (crash gone, but no dialog, no
   error, nothing granted — app didn't even appear in Health Connect's own
   app list). Android 14+ requires a manifest `<activity-alias>`
   (`ViewPermissionUsageActivity`, category `HEALTH_PERMISSIONS`) to
   register as a Health Connect client at all — also missing from the
   library's plugin. Fixed with a second plugin (`mobile/plugins/
   withHealthConnectPermissionsRationaleActivity.js`), mirroring the
   library maintainer's own fix in matinzd/react-native-health-connect#60.
3. **Sync fails with a generic network error** against `http://<lan-ip>:
   port`. Android blocks cleartext HTTP to non-localhost hosts by default
   for apps targeting API 28+. Fixed with `expo-build-properties`'s
   existing `android.usesCleartextTraffic` option.

All three are config/native-manifest changes, each needing a fresh EAS
build to test — no way around that with the managed-workflow/no-committed-
`android/` setup this project uses.

**New bug found in this same pass, not yet fixed:** a *second* sync
attempt (after a first one already succeeded) hangs indefinitely — see
VIK-74. `sync.ts`'s `fetch()` call has no timeout, which is the leading
unconfirmed hypothesis.

### 2026-08-27 — VIK-74 fixed: fetch timeout in sync.ts

Confirmed by reading the code (no real-device repro needed — the bug is
structural, not environment-specific): `post()`'s `fetch()` call had no
timeout/`AbortController`, and `App.tsx`'s `syncNow()` has no timeout guard
of its own either, so any hung request left the UI in `busy === "sync"`
forever. The server route (`app/api/ingest/[type]/route.ts`) has no
mechanism that would itself hang indefinitely, so this was treated as the
"add a client-side timeout for robustness regardless of root cause" case
the ticket already anticipated, rather than a server-side fix.

Fixed: `post()` now races each batch `fetch()` against an `AbortController`
timeout (`FETCH_TIMEOUT_MS`, 30s, exported from `sync.ts`). A timeout aborts
the request and surfaces as a normal `${ingestType}: ERROR …` result — the
same path `runSync()`'s existing per-plan try/catch already reports through,
so no change was needed in `App.tsx`; its `finally { setBusy(null) }`
now always runs because `runSync()` is now guaranteed to settle.
`mobile/test/sync.test.ts` covers it with a fetch stub that only resolves
when its `AbortSignal` fires (using `node:test`'s mock timers to advance
past the timeout without a real 30s wait).

**Real-device validated** (Galaxy S25, PR #15's build off `v3-generalized`
post-merge): first sync succeeded, then a second sync after logging another
MyFitnessPal update completed cleanly with no hang — confirmed twice. VIK-74
closed; VIK-75 (product-testing onboarding doc) is now unblocked.

## 3. iOS — new work, but not from raw native code

`react-native-health` ([agencyenterprise/react-native-health](https://github.com/agencyenterprise/react-native-health),
actively maintained, MIT) exposes `getEnergyConsumedSamples`,
`getProteinSamples`, `getCarbohydratesSamples`, `getTotalFatSamples`,
`getFiberSamples` — the exact HealthKit `Dietary*` reads Open Wearables'
own closed PR attempted. Not available in Expo Go; needs a custom dev
client, same pattern this app already uses for Android (`expo prebuild`,
EAS `development`/`preview` profiles) — not a new paradigm, just extending
one already adopted.

### iOS spike — resolving the 3 open questions before the mapper gets written

Three things a real-device spike needs to answer; don't design the mapper
blind against any of them. Time-boxed, not a full build — mirrors how the
Open Wearables spike (VIK-11/12/13) was scoped.

**Prerequisites (external, not code):**
- A physical iPhone with real MyFitnessPal data logged to Apple Health —
  several days, varied meal types, ideally including at least one day with
  multiple meals so grouping behavior is actually exercised.
- An Apple Developer Program membership ($99/yr) — required for the
  HealthKit entitlement on a real-device build. Already flagged in
  `HANDOFF.md` as an unavoidable cost independent of this spec.
- `"ios"` added to `mobile/app.json`'s `platforms`, a bundle ID, an `ios`
  config block, and a new EAS `ios` build profile (only `android` exists
  in `eas.json` today).

**Step 1 — confirm the Expo integration path (no device needed yet).**
`react-native-health`'s README points at a `docs/Expo.md` guide — read it
first. Determine: does the library ship an official Expo config plugin, or
does this repo need to write a thin custom one (the pattern already used
for `react-native-health-connect` in `app.json`'s `plugins` array)? Answer
this before writing any Swift/Obj-C or fighting a prebuild error blind.

**Step 2 — build a throwaway dev client and confirm permissions work.**
`expo prebuild` + EAS `development` build with `react-native-health`
installed, requesting read access to
`HKQuantityTypeIdentifierDietaryEnergyConsumed`/`DietaryProtein`/
`DietaryCarbohydrates`/`DietaryFatTotal`. Install on the real iPhone,
confirm the HealthKit permission sheet actually appears and grants access —
this is the same "does it even build for real" checkpoint the Android
pipeline skipped (per `HANDOFF.md`, never run against real hardware) and
shouldn't be skipped again here.

**Step 3 — read real MyFitnessPal-logged samples and inspect their shape.**
Call `getEnergyConsumedSamples`/`getProteinSamples`/
`getCarbohydratesSamples`/`getTotalFatSamples` for a day with known,
real MFP meals (cross-reference against what's actually in the MFP app as
ground truth). Inspect what comes back:
- Do same-meal samples share a `HKCorrelationTypeIdentifierFood`
  correlation, or just matching timestamps with no formal correlation?
  This determines the grouping rule — group on the correlation if present,
  otherwise timestamp + a tolerance window (same idea as `mapper.ts`'s
  existing `mapActivity()` day-bucketing).
- Re-run the same query twice against the same underlying data. Does the
  grouping/keying come out identical both times? If not, the naive
  approach isn't idempotent-safe and needs a different key.

**Step 4 — decide the synthetic idempotency key, then write the mapper.**
Once step 3's grouping rule is confirmed stable, decide the `hcUid`-
equivalent (e.g. a stable hash of the correlation ID, or
`apple-${date}-${mealType}` if timestamp-bucketed instead). Build
`mapHealthKitNutrition()` (new `mobile/src/healthKit.ts` sibling to
`healthConnect.ts`, or a new export in `mapper.ts`) producing the same wire
shape `mapNutrition()` already does. Manually POST one real day's data
against a local backend to confirm it lands correctly in
`nutrition_entries` before writing the real fixture-based unit tests
(`mapper.test.ts`'s existing style — meal-type/grouping edge cases,
zero-energy filtering, missing-field fallbacks).

**Deliverable:** answers to the three questions above, written up (Linear
comment on the spike ticket, or an update to this section) with real
evidence — not another docs read. Unblocks the "iOS mapper + sync module"
build ticket.

## Explicitly deferred

- Reviving the old pipeline's other five record types on Android — Open
  Wearables' job once its own spec/build lands (see "Why nutrition-only"
  above).
- A formal multi-provider abstraction for "where does health data come
  from." Two concrete pipes (Open Wearables for most things, this one for
  nutrition) is fine at current scale; don't build a pluggable-source
  interface speculatively — same YAGNI call `HANDOFF.md` already made for
  the Open Wearables pivot itself.
- Reconciling what happens if Open Wearables *does* eventually ship
  nutrition support upstream. Cross that bridge if/when it happens — not
  worth designing a migration-off-this-pipeline path for a vendor feature
  that doesn't exist yet.

## Recommended sequencing

1. ~~Backend account-scoping + index fix (§1)~~ — **done**, see status note
   in §1.
2. Android narrowing + real-device validation (§2) — cheapest path to a
   real end-to-end nutrition sync, since the code already exists.
3. iOS spike (§3's four-step plan) — time-boxed, answers needed before the
   mapper can be written for real. Needs a physical iPhone + an Apple
   Developer Program membership before it can start.
4. iOS mapper + sync module + EAS build profile, once the spike resolves
   the grouping-key question.

## Test plan (TDD — write these first, per repo convention)

- ~~`POST /api/ingest/nutrition`: rows land tagged with the *posting
  account's* `accountId`, not the single-tenant fallback~~ — done,
  `tests/ingest-route.test.ts`.
- ~~Two accounts syncing nutrition for the same day/device don't collide on
  upsert (exercises the new composite index)~~ — done, same file.
- ~~`nutritionRecord`'s new upper bounds reject an absurd value (e.g.
  `calories: 1e12`) with a 422~~ — done, same file.
- ~~Two accounts syncing weight/hydration/sleep/exercise/activity with the
  same hcUid (or, for activity, the same local date) don't collide~~ —
  done, same file, one test per type.
- Android: existing `mapper.test.ts` coverage for `mapNutrition()` stays
  green after narrowing; add a test that `sync.ts`'s trimmed `plans` array
  only contains the nutrition entry.
- iOS: once the spike answers the grouping-key question, a
  `mapHealthKitNutrition()`-equivalent gets the same shape of unit tests
  `mapper.test.ts` already has for `mapNutrition()` — meal-type/grouping
  edge cases, zero-energy filtering, missing-field fallbacks.
