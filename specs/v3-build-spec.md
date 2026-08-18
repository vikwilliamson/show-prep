# Show Prep → V3 Prototype Build Spec
**Source:** Partner meeting notes (Mike, John, Jake) — Aug 11, 2026
**This pass covers:** Core loop (goals → data → AI brief) + real wearable/health integrations via Terra (unified aggregator, replacing a custom /ingest build), with terminology generalized away from bodybuilding now.
**Deferred to a later pass:** Twilio SMS client chat, multi-tenant API packaging for telehealth partners, formal HIPAA/SOC 2 work, Terra Enterprise/BAA (see compliance note — not deferred in effect, just not yet needed given no covered entity in the chain).
**Target:** private link, within the week.
**Data:** real, live data from day one — starting with Vik and spouse, then John/Mike/Jake as testers. No dummy/synthetic data as a design assumption anywhere in this pass; seed data is for UI edge cases only, never the primary path.

---

## Setup — Branching & Versioning (do this first, before Phase 0)

**Prompt:**
```
Set up version control before any generalization work begins:

1. Tag the current V2 state as a restore point:
   git tag v2.0.0-bodybuilding
   git push origin v2.0.0-bodybuilding

2. Create and switch to a working branch for all V3 work:
   git checkout -b v3-generalized

3. Bump package.json version to a pre-release marker to signal in-progress
   major version work, not a shipped release:
   "version": "2.0.0-alpha.1"
   Increment the alpha/beta/rc suffix at each milestone (alpha.2, beta.1,
   rc.1) and only cut a clean "2.0.0" tag once this branch merges to main.

4. Confirm Vercel branch previews are enabled so pushing v3-generalized
   auto-deploys to its own preview URL — that preview URL is the private
   demo link for this round. main / show-prep-gamma.vercel.app (production)
   stays untouched and still demoable as V2 throughout the build.

All Phase 0-4 work happens on v3-generalized, not main. This matters more
than usual here because Phase 0 does in-place renames of data model fields
(not just UI labels) — the v2.0.0-bodybuilding tag is the rollback point if
anything breaks.
```

---

## Architecture decision: Terra as the unified health data layer

Apple Health, Google Health, and Samsung Health don't expose a web/REST API — they only sync via native mobile SDK, on-device. A custom `/ingest` pipeline would need to solve that itself. Instead, **Terra's Mobile SDK (Swift/Kotlin/React Native/Flutter) already wraps HealthKit and Health Connect on-device** and pushes normalized data to a webhook — the exact problem a custom pipeline would've been built to solve. For everything else (Garmin, Fitbit, MyFitnessPal, Oura, Strava), **Terra's Web API/webhooks work with zero mobile app involvement at all.**

This collapses the two-track plan into one:
- **Mobile companion app**: still needs to exist (Terra's SDK needs a native host), but its job shrinks to embedding the Terra SDK and calling `initConnection()` — not writing custom HealthKit/Health Connect readers or a batch-sync job.
- **Backend `/api/health-webhook` endpoint** (renamed from `/ingest`): receives Terra's already-normalized payloads for *all* sources — Apple/Google/Samsung Health (via their Mobile SDK) and Fitbit/Garmin/MyFitnessPal (via their Web API) — through the same webhook receiver. One endpoint, one schema, regardless of source.
- **Manual fallback**: unchanged, still the default when nothing is connected.

**Compliance requirement — required for this pass, not deferred:** Terra's Terms of Service prohibit sending PHI or special-category personal data through their platform unless you're on an Enterprise License Agreement with a signed BAA; otherwise data must be pseudonymized/de-identified before reaching Terra. Since real data (Vik, spouse, then John/Mike/Jake) connects from the start — not dummy data — this isn't a someday item. See the pseudonymization requirement built into Phase 2 below. No covered entity (e.g. a telehealth partner) is in the data chain yet, so this likely isn't formal HIPAA PHI today — but Terra's broader "special category" restriction applies regardless, so the architecture has to assume real, identifiable health data from the first connected account.

---

## Phase 0 — Generalize Terminology & Nav

**Prompt:**
```
Refactor Show Prep's terminology away from bodybuilding-contest-specific
language toward generic coaching language. This is an IN-PLACE RENAME: update
the data model itself (schema fields, types, API request/response keys,
variable names), not just the rendered UI text.

- Rename "Divisions" → "Program Type" throughout: database column/field,
  TypeScript types, API payloads, and UI. Bodybuilding divisions become one
  selectable program type among others (e.g. "Physique Prep," "Weight Loss,"
  "General Coaching")
- Remove "Weight Cap" entirely: delete the nav item, the /calculator route, and
  the underlying component. This is a bodybuilding-specific concept (hitting a
  competition weight-class limit) with no analog in general coaching — it's not
  part of the abstracted MVP. General target-weight tracking is already covered
  by the Smart Goals dashboard in Phase 1 (trend chart, countdown, macro
  compliance), so removing this loses no functionality the vision needs.
- Audit copy across Dashboard, Documents, Check-In, Doc Chat, Settings for
  bodybuilding-specific wording (e.g. "show," "peak week," "posing") and
  replace with generic coaching equivalents, in both code and copy
- Write a migration for existing seeded/demo data so records using old
  field names (e.g. "division") are converted to the new schema, not left
  broken
- Update any seed scripts, fixtures, or mock data generators to use the new
  field names going forward
- This work happens on the v3-generalized branch (see Setup section above);
  v2.0.0-bodybuilding tag is the rollback point if the rename breaks something
```

---

## Phase 1 — Goals/Settings as Core Config Layer

**Prompt:**
```
Build out the Settings/Goals page as the central config layer that drives
the rest of the app. Fields: target weight, height, macros (protein/carbs/fat
or calories), program type, timezone, water intake goal, workout frequency.

This config should feed a "Smart Goals" dashboard view with:
- Countdown timer to target date
- Trend chart (weight/measurement over time)
- Macro compliance graph (daily target vs. logged)

Real accounts (starting with Vik and spouse) populate this from day one.
Only use synthetic/seeded data for UI states you don't have real data for
yet (e.g. an empty-state mockup) — never as the primary data source, and
never mixed into the same records as real client data.
```

---

## Phase 2 — Health Data Bus (Terra, unified)

**Prompt:**
```
Integrate Terra API as the single health-data layer for the app, replacing
the earlier split /ingest-vs-aggregator plan with one unified path. Real
accounts (Vik, spouse, then John/Mike/Jake) connect from day one — build
this as production-real from the start, not as a demo shortcut.

0. Pseudonymized identity layer (REQUIRED, build first)
   Every client record gets an opaque internal ID (random UUID) at account
   creation, generated server-side. This ID — never name, email, or any
   other directly identifying field — is the ONLY identifier ever sent to
   Terra as the reference_id when initializing a connection (Mobile SDK)
   or OAuth flow (Web API). The real client record (name, contact info,
   coach assignment) lives only in our own database, keyed by that same
   ID, so the coach dashboard can re-link data to the real person locally.
   Audit every Terra API call and payload field before Phase 2 ships to
   confirm no PII beyond the opaque ID ever leaves for Terra — this is a
   hard requirement, not a nice-to-have, given real data is connecting
   from day one.

1. Backend webhook receiver
   Build a POST /api/health-webhook endpoint that receives Terra's payloads
   for all connected sources (Apple Health, Google Health, Samsung Health
   via Terra's Mobile SDK; Fitbit, Garmin, MyFitnessPal via Terra's Web API).
   - Verify Terra's webhook signature
   - Normalize incoming payloads into our own common schema (steps, sleep,
     weight, active_energy, etc.) so downstream code — dashboard, AI weekly
     brief — doesn't care which provider or path the data came from
   - Idempotency: dedupe on (client_id, source, type, start, end) since
     Terra may redeliver on retry
   - client_id here is always the pseudonymous internal ID from step 0

2. Web-only providers (Fitbit, Garmin, MyFitnessPal)
   Set up Terra's OAuth connect flow for these directly from the Next.js
   backend — no mobile app involved. Confirm data lands at the same
   /api/health-webhook endpoint above, keyed to the pseudonymous ID.

3. Mobile-SDK providers (Apple Health, Google Health, Samsung Health)
   In the mobile companion app, integrate Terra's Mobile SDK
   (Swift/Kotlin/React Native/Flutter depending on stack) and call
   initConnection() with the pseudonymous reference_id to establish the
   on-device HealthKit/Health Connect link. Terra handles the permission
   flow and pushes resulting data to the same webhook.

4. Consent step (build before any real account connects)
   Before a client (including Vik and spouse) connects a wearable/health
   account, show a plain-language screen: what data is collected, that it
   passes through Terra as a processor, and where it's stored. Require an
   explicit acknowledgment before the connect flow starts. Lightweight,
   but it must exist before the first real connection — no exceptions,
   including for internal testers.

5. Manual fallback
   Keep the existing manual entry form as the default path when nothing
   is connected.

Do NOT rely solely on this team's own reading of Terra's ToS as sufficient
sign-off — separately, Vik will send Terra a written confirmation request
that pseudonymized reference IDs + health metrics with no other PII is
compliant with their standard-tier terms, before real accounts connect.
```

---

## Phase 3 — AI Weekly Analysis / Coach Brief

**Prompt:**
```
Build a scheduled job (cron, ~2am client-local-time per user, matching
Mike's polling cadence decision) that:

1. Pulls the past week's structured check-in data (goals config + wearable/
   manual data + any doc-chat context) for each client
2. Calls Claude to draft a coach brief: adherence summary, notable trends,
   flags worth the coach's attention
3. Saves the brief to a coach-facing view, clearly labeled "AI-assisted,
   not AI-answered"
4. Give the coach a way to review/edit/approve the brief before it's
   considered final — this should be a lightweight confirm/override action,
   not a full rewrite flow
```

---

## Phase 4 — AI Transparency Pass

**Prompt:**
```
Audit every AI-generated surface in the app (coach briefs, doc chat replies)
and add a consistent "AI-assisted" label/badge. For coach-facing AI content
specifically, add a visible override/confirm control so it's clear a human
is the final checkpoint, not the AI.
```

---

## Explicitly deferred (don't build yet)

- **Twilio SMS client chat** — Vik is still investigating the API; not ready for a build prompt.
- **API-first/microservice packaging for telehealth partners** — keep endpoints reasonably clean and separable as you build, but don't build actual multi-tenant/external API infra this pass.
- **HIPAA/SOC 2 formalization** — positioning only for now (coaching/aggregation tool, not a medical platform); no formal compliance engineering/audit this pass. The pseudonymization + consent work in Phase 2 is *not* deferred — it's required now because real data connects from day one, and it's also good groundwork for whenever formal HIPAA scope does kick in.
- **Terra Enterprise + BAA (formal agreement)** — genuinely deferred until a covered entity (e.g. a signed telehealth partner) is actually in the data chain, which is the actual HIPAA trigger. Until then, the pseudonymized-ID architecture plus written confirmation from Terra is the operating approach. Revisit this the moment a telehealth partnership moves from discovery to signed — don't let it slide past that point.

---

## Non-dev action items (not Claude Code prompts)

| Owner | Action |
|---|---|
| Vik | Draft business plan + equity/ownership terms (Vik majority; John, Jake, Mike minority) |
| Vik | Investigate Twilio API for two-way client SMS |
| Vik | Email Terra to confirm in writing that pseudonymized reference IDs + health metrics (no other PII) are compliant with their standard-tier ToS, before any real account connects |
| John, Jake, Mike | Compile long-term MVP wish list, then distill to what ships + generates revenue first |
| John, Jake | Reach out to Gen Health and Max's clinic — gauge interest, gather requirements, set up live demo w/ real wearable tracking |
