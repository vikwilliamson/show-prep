# Initial Demo Deck — Prompt for Claude

**What this is:** a copy/paste-ready prompt to hand to a Claude session (claude.ai
or Claude Code with browser automation available) to assemble a pitch/demo
deck for Gamma from the *actual current build* — not a mockup, not aspirational
copy. Written 2026-09-02, against the state described in this repo's
`specs/prd.md` and the `Gamma` Linear project.

**Why a prompt file, not the deck itself:** the deck needs live screenshots
of the running app plus mobile screenshots only Vik can provide from his own
phone — better generated in a session with browser + file-upload access than
authored by hand here.

**Before using this:** reread `specs/prd.md`'s Status table and the `Gamma`
Linear project for what's actually shipped vs. planned — if that's drifted
since 2026-09-02, update the "What's actually built" section below before
handing this prompt off, so the deck doesn't quietly go stale.

---

## The prompt (copy everything below the line to Claude)

---

I need you to build a pitch/demo deck for **Gamma**, a coaching platform I'm
building. This deck should represent the product **as it actually exists
today** — real screenshots of the real running app, not a mockup or
aspirational feature list. I'll be presenting this myself, driving a live
Android demo alongside it, so the deck should support that walkthrough, not
try to replace it.

### About the product

Gamma is a coaching platform for any 1:1 coach-client relationship —
physique prep, weight loss, general coaching — built around three ideas: one
config layer (goals/targets) that drives everything else; health data that
syncs in automatically instead of being hand-typed; and an AI layer that
drafts the coach's weekly check-in and analysis, always reviewed and
approved by the human coach before a client sees it.

It's early-stage: pre-revenue, bootstrapped, real users today (the founder
and his spouse), a few more testers about to come on. This is not a concept
pitch — it's a working product with a genuinely small, real user base. The
deck's tone should reflect that honestly: confident about what's built and
working, not overselling what's still roadmap.

### What's actually built today (put this in the deck; don't claim more)

**Web app — fully live:**
- Coach/client account system, per-account passcode login
- Progress dashboard: days-to-target, current vs. target weight, active
  macro protocol, 90-day bodyweight trend, 14-day macro-compliance chart,
  "this week at a glance" (water/sleep/lifting/cardio vs. the client's own
  targets)
- Document upload (PDF/text/pasted email) with AI-extracted macro/cardio
  prescriptions — client confirms or rejects before it becomes active;
  full protocol history preserved
- One-click AI-drafted weekly check-in from the week's data, editable,
  copyable, opens in email
- Doc chat — ask a plain-language question, get an answer grounded in the
  client's own uploaded documents, with cited sources
- Coach dashboard: client list + per-client view (a coach can see every
  client's dashboard, not just their own)

**Mobile companion — Android only, real-device validated:**
- A React Native/Expo app that reads MyFitnessPal nutrition data out of
  Android Health Connect and syncs it to the web app automatically
- Confirmed end-to-end on a real device: log a meal in MyFitnessPal → it
  appears in Health Connect → the companion app syncs it → it shows up on
  the web dashboard's macro-compliance panel
- Pairing today is manual (copy a pairing ID from web Settings, paste into
  the app) — functional but not polished; don't overstate this as
  effortless in the deck copy

**Explicitly NOT built yet — do not claim these are live:**
- iOS companion app (Android only right now)
- Automatic sync of weight/sleep/water/steps (only nutrition auto-syncs
  today; everything else is still manual entry, which is the permanent
  fallback path regardless)
- AI weekly coach brief (a scheduled/on-demand AI-drafted summary per
  client) — planned, not built
- Consistent "AI-assisted" labeling across AI surfaces — planned, not built
- A consent screen for connecting a health app

If it's useful for the deck's "what's next" section, those last few are the
literal near-term roadmap — fine to name as roadmap, not as shipped.

### Step 1 — capture web screenshots yourself

Use Playwright (or equivalent browser automation) to screenshot the live
app. I'll give you the base URL to use — ask me for it if it's not already
in this conversation (either my local dev server, e.g. `http://localhost:3000`,
or the deployed Vercel demo URL).

Login: the app has a one-click seeded portfolio-demo login on `/login` (a
button reading "Enter demo →") if `NEXT_PUBLIC_DEMO_PASSWORD` is configured
in that environment. Use it if present. **Caveat:** the seeded demo account
is a coach-only account with no seeded client, so `/clients` will render an
empty client list through that path — if you hit that, tell me and I'll
either give you real login credentials (coach account with a real client
underneath it) or seed a demo client account first. Don't screenshot an
empty client list and present it as the coach dashboard.

Capture, full-page, at a desktop viewport (1440×900) with the network idle:
- `/` — dashboard
- `/settings` — goals/targets config
- `/documents` — upload + AI extraction, ideally with at least one
  confirmed protocol visible
- `/check-in` — the check-in draft generator, ideally with a generated draft
  visible
- `/chat` — doc chat, ideally with a real question/answer exchange visible
- `/clients` — coach dashboard client list (see caveat above)
- `/clients/[accountId]` — a per-client dashboard view (click into a real
  client from the list rather than guessing an ID)

If any page requires state that doesn't exist yet in the environment you're
pointed at (e.g. no documents uploaded, no check-in generated), tell me
rather than screenshotting an empty/broken-looking state — I'd rather add
seed data first.

### Step 2 — mobile screenshots (I'll provide these)

I'll upload screenshots from my own Android phone. Expect: the companion
app's pairing/config screen, a sync-in-progress or sync-success state, and
ideally a shot of MyFitnessPal or Health Connect itself for context. Use
whatever I upload; don't fabricate mobile UI.

### Step 3 — build the deck

Structure (adjust if you have a better idea, but cover these beats):
1. **Title/positioning** — what Gamma is, one line
2. **The problem** — why coaching today is manual, disconnected, hard to
   scale (client-logged data, hand-written check-ins, no single source of
   truth)
3. **The product, in one paragraph** — the three-idea framing above
4. **Product tour** — the web screenshots, one idea per slide (dashboard →
   document AI extraction → check-in AI draft → doc chat → coach dashboard)
5. **Mobile companion** — the Android sync story, with the uploaded phone
   screenshots, framed honestly as "Android today, iOS next"
6. **Status** — real users today (not a concept), what's live vs. near-term
   roadmap (AI weekly brief, AI transparency labeling, iOS, richer wearable
   sync) — keep this slide honest per the "what's NOT built yet" list above
7. **Ask/close** — leave this slide as a placeholder with a note like
   "[Vik to fill in: what are you asking for — testers, funding, feedback?]"
   since I haven't told you the audience or ask yet

Produce it as a set of slides I can actually present from — an HTML/artifact
slide deck if you have that capability, otherwise a clean Markdown deck with
the screenshots embedded/referenced. Keep visual design simple and
professional; this is a product demo, not a design showcase.

---

## Notes for whoever runs this (not part of the prompt above)

- If the audience for this deck is known by the time you run this (investors
  vs. prospective testers vs. internal), tell Claude up front — it changes
  the ask slide and possibly the tone throughout.
- Re-seed or use a real coach+client login before running Step 1 if the
  `/clients` empty-state caveat above would otherwise bite.
