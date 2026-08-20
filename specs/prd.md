# Gamma — Product Requirements

**What this is:** a lightweight PRD — vision, personas, user stories, MVP
scope, terminology, and open questions. Trimmed down from a longer
designer/pitch-deck brief; kept here as the one stakeholder-facing doc that
isn't phase-by-phase build instructions.

**What this isn't:** the build spec. For phase-by-phase engineering scope,
read `specs/v3-build-spec.md` and the per-phase specs alongside it
(`phase-0-terminology.md`, `client-accounts.md`, `phase-1-followups.md`,
`phase-2-terra.md`, `phase-2.5-coach-dashboard.md`). For current build
status, read `HANDOFF.md` — it's the one meant to be updated every session;
this doc should be re-trimmed against it periodically, not treated as
equally current by default.

**Last aligned to `HANDOFF.md`:** 2026-08-19.

---

## The product, in one paragraph

Gamma (formerly "Show Prep") is a coaching platform for any 1:1 coach-client
relationship — physique prep, weight loss, general coaching — built around
three ideas: one config layer (goals/targets) that drives everything else;
health data that syncs in automatically instead of being hand-typed; and an
AI layer that drafts the coach's weekly check-in and analysis, always
reviewed and approved by the human coach before a client sees it. It's real
today, not a demo: Vik and his spouse use it, with three more testers
(John, Mike, Jake) coming on next.

---

## Status

| Status | Item |
|---|---|
| **Live** | Original V2 feature set: dashboard, document upload + AI protocol extraction, weekly check-in draft generator, doc chat |
| **Live** | Client Account Foundation — coach/client roles, per-account passcode login (replaced the old single shared password) |
| **Live** | Phase 0 — generalized terminology (`programType`, `targetDate`/`targetName`/`targetNote`/`targetWeightLbs`), Weight Cap removed, Gamma rebrand |
| **Live** | Phase 1 — settings/dashboard/check-ins/documents/chat all real per-account-scoped data |
| **Planned, 3 small gaps** | `specs/phase-1-followups.md` — manual macro/calorie goals in Settings, a coach "add a client" flow, check-in template editing |
| **Planned, spike in progress** | Phase 2 — health data aggregation. Originally spec'd around Terra; pivoted (2026-08-19) to a self-hosted [Open Wearables](https://github.com/the-momentum/open-wearables) instance covering both iOS (HealthKit) and Android (Health Connect/Samsung Health), since the pilot cohort is mixed-platform and Terra's cheapest self-serve tier ($499/mo) isn't justified at pilot scale. See `HANDOFF.md`'s "Phase 2 status" for full reasoning and the active spike plan. |
| **Planned** | Phase 2.5 — coach dashboard: a client list + per-client view, so Phase 3's briefs have somewhere to land. Not started. |
| **Planned** | Phase 3 — AI weekly coach brief (scheduled job, coach review/approve before it's final). Depends on 2.5. |
| **Planned** | Phase 4 — consistent "AI-assisted" labeling across every AI surface |
| **Deferred** | Twilio SMS client chat, multi-tenant/telehealth API packaging, formal HIPAA/SOC 2, Terra Enterprise + BAA — real roadmap items, not abandoned; see "Open questions" below for why they're not built yet |

---

## Who uses this

**Coach.** Currently one (Vik) — no multi-coach support until there's an
actual second coach (deliberate YAGNI, flagged in both
`specs/client-accounts.md` and `specs/phase-2.5-coach-dashboard.md`). A
coach account can also independently be a client of itself — that's how
Vik's own goals/check-ins keep working under a real account row instead of
being the app's one implicit user. Needs a weekly rhythm: read each
client's week, write a personalized check-in, adjust the protocol — the
manual version of that work is what the AI brief (Phase 3) is built to
shrink, not replace.

**Client.** A real person being coached — Vik's spouse today, then John,
Mike, and Jake as testers, eventually paying clients. Logs into their own
account, sees their own dashboard/goals, optionally connects a wearable (or
keeps entering data manually — that path never goes away), reads coach
documents, fills in the subjective half of their weekly check-in. No
coach-facing "all my clients" view exists yet (Phase 2.5 builds it).

---

## User stories

Status tags: **Live** (shipped) · **Planned** (spec'd, not built) · a bare
epic tag means everything under it is Live unless marked otherwise.

### Account & access
- **Live** — Client logs in with a personal passcode, not a password shared across every client.
- **Live** — A coach account can also act as a client account (self-coaching).
- **Planned** — Coach has read access across every client account (role exists; no UI consumes it yet — Phase 2.5).
- **Planned** — Coach can create a new client account and hand them a passcode out-of-band (`specs/phase-1-followups.md`).
- **Live** — A visitor can enter a seeded demo with one click, no account needed.

### Goals & program config
- **Live** — Client sets a target name, target date, and one program type (Physique Prep / Weight Loss / General Coaching).
- **Live** — Client sets weekly thresholds (water, sleep, workout frequency, cardio) that drive their own check-in questions.
- **Planned** — Client sets manual macro/calorie goals in Settings, used whenever there's no active coach-uploaded protocol (`specs/phase-1-followups.md`).
- **Live** — Client records a target weight; dashboard shows distance to it.

### Progress dashboard
- **Live** — One screen: days-to-target, current weight vs. target, active macro protocol.
- **Live** — 90-day bodyweight trend and 14-day macro-compliance charts.
- **Live** — "This week at a glance": water/sleep/lifting/cardio vs. the client's own targets.
- **Live** — Direct link from the dashboard into this week's check-in draft.
- **Planned** — Coach sees a client list and can open any client's dashboard (Phase 2.5).

### Coach documents & AI extraction
- **Live** — Upload a PDF/text/pasted email; AI extracts a structured macro/calorie/cardio prescription.
- **Live** — Client confirms or rejects an extracted prescription before it becomes active.
- **Live** — Protocol history (superseded/rejected/reactivated) is preserved, not overwritten.
- **Live** — Documents are categorized (coach protocol / program rules / other).

### Weekly check-in
- **Live** — Data-backed answers (macros, weight, water, sleep, workouts) pre-fill from synced/logged data; client only types the subjective parts.
- **Live** — One click generates a fully written AI-drafted check-in from those answers.
- **Live** — Draft is editable, copyable, and can open directly in email; marking it sent keeps a running history.
- **Planned** — Coach can edit a client's check-in template, not just the client themself (`specs/phase-1-followups.md`).

### Doc chat
- **Live** — Ask a plain-language question, get an answer grounded in the client's own uploaded documents, with cited sources.
- **Live** — Chat history can be cleared.

### Health data connections & consent
- **Planned** — Client connects Apple Health, Google Health, or Samsung Health; weight/sleep/water/steps/nutrition sync automatically. (Aggregator vendor is Open Wearables, self-hosted, as of the 2026-08-19 pivot — see Status table above. Kept vendor-generic here deliberately; don't hardcode a vendor name into product copy or this doc.)
- **Planned** — A plain-language consent screen (what's collected, how it's processed, where it's stored) is required before any account's first connection — no exceptions, including internal testers.
- **Live** — Manual entry keeps working as the default when nothing's connected; a wearable is optional, never required. *(Note: the manual-entry form itself doesn't exist yet either — flagged as a real gap in `specs/phase-2-terra.md`'s "Corrections to the parent spec," still applies post-pivot.)*
- **Planned** — Every client is identified to the aggregator only by an opaque internal `reference_id` — never name, email, or phone.

### AI weekly brief & transparency
- **Planned** — A scheduled job drafts a weekly brief per client (adherence summary, trends, flags) from check-in + health + doc-chat data.
- **Planned** — Coach reviews, edits, and approves each brief before it's final — lightweight confirm/override, not a full rewrite flow.
- **Planned** — Every AI-generated surface (brief, chat replies) is visibly labeled "AI-assisted."

---

## MVP scope

**Demoable now:** login, dashboard, settings/goals, document upload with AI
protocol extraction, weekly check-in draft generation, doc chat — all real
per-account data, not a shared demo record.

**Near-term roadmap:** the 3 Phase 1 follow-up gaps, health-data
aggregation (Open Wearables spike → real integration), the coach dashboard
(Phase 2.5), the AI weekly brief with human approval (Phase 3), consistent
AI-transparency labeling (Phase 4).

**Explicitly deferred:** Twilio SMS, telehealth-partner API packaging,
formal HIPAA/SOC 2, Terra Enterprise + BAA. All real, none abandoned — see
Open questions below.

---

## Screens inventory

| Screen | Status |
|---|---|
| `/login` | Live |
| `/` Dashboard | Live |
| `/settings` | Live |
| `/documents` | Live |
| `/check-in` | Live |
| `/chat` | Live |
| Consent screen (before first wearable connection) | Planned |
| Wearable/health connect flow | Planned |
| Coach client-list + per-client dashboard (`/clients`, naming TBD) | Planned — `specs/phase-2.5-coach-dashboard.md` |
| Coach brief review | Planned — Phase 3/4 |
| Mobile companion app | Exists (Expo/React Native), mid-rewrite — Android-only hand-rolled Health Connect code is being replaced by the Open Wearables SDK for both platforms |

---

## Terminology

Matches the actual schema/field names — use this in copy and code both.

| Use | Not this | Means |
|---|---|---|
| Program type | Division | Client's coaching track — Physique Prep, Weight Loss, or General Coaching. Single-select. |
| Target name / target date / target note | Show name / show date / next competition note | Whatever the client is working toward, when, and a free-text note about it. |
| Target weight | Target stage weight | The client's weight goal. |
| Protocol | — | A macro/cardio prescription extracted from a coach document. States: pending → active → superseded / rejected. |
| Coach brief | — | AI-drafted weekly analysis a coach reviews and approves before it's final. |
| Client / coach | Athlete / competitor | The two account roles. |
| Reference ID | — | Opaque UUID sent to the health-data aggregator in place of any identifying info. |

Explicitly banned per `AGENTS.md`: `division`, `weight cap`, `peak week`,
`posing`.

---

## Open questions

- **Aggregator choice isn't confirmed yet.** Open Wearables is the working
  plan (see Status table), but a local spike still needs to confirm
  nutrition/dietary data actually flows through both its HealthKit and
  Health Connect connectors, and whether its outbound webhooks are mature
  enough to build against or need a polling fallback. Don't treat "Open
  Wearables" as locked in this doc until `HANDOFF.md` says the spike
  resolved it.
- **Single-coach is a deliberate, temporary assumption**, not an oversight —
  flagged identically in `specs/client-accounts.md` and
  `specs/phase-2.5-coach-dashboard.md`. The moment a second coach account is
  created, `accounts` needs a real coach↔client relationship column; every
  `role = 'client'` query needs to become coach-scoped too.
- **The manual health-data entry form doesn't exist yet**, despite being
  assumed as "already there" in the original build spec — a real gap
  Phase 2 needs to close, not optional.
- **Deferred items are real, not abandoned.** Twilio SMS is pending Vik's
  own API research; telehealth-partner API packaging and formal HIPAA/SOC 2
  are staged for if/when a covered entity (e.g. a signed telehealth
  partner) actually enters the data chain — see `v3-build-spec.md`'s Gen
  Health / Max's clinic outreach item. That's also the real trigger for
  reconsidering Terra, more than pilot-scale cost or risk.
