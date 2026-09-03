# Phase 4 — AI Transparency Pass — Build Spec

**Source:** VIK-10 ("Write a real Phase 4 spec, then build the AI
transparency pass"). Written 2026-09-02 alongside `specs/
phase-3-ai-weekly-coach-brief.md` — build these together, not sequentially,
since the shared badge component is used by both the new coach-brief UI and
the retrofit surfaces below.

**Depends on:** nothing structurally, but sequenced after Phase 3 starts so
the brief review UI (`components/CoachBrief.tsx`) is built with the badge
from day one instead of retrofitted a second time.

**This pass covers:** a consistent "AI-assisted" visual label across every
AI-generated surface in the product, per the PRD's user story: *"Every
AI-generated surface (brief, chat replies) is visibly labeled
'AI-assisted.'"*

## Scope decision (made 2026-09-02)

**Retrofit every existing AI surface, not just the new coach brief.**
Considered scoping this to only the new Phase 3 brief panel (smaller,
lower-risk right before a demo) but decided with Vik to do the full retrofit
— doc chat, the check-in draft, the existing client-facing Weekly Analysis,
and the document-extraction confirmation flow, in addition to the new coach
brief. Rationale: the PRD's own wording is "every AI-generated surface," and
a demo is exactly the moment this is most visible/checkable — better to
have the consistent story now than explain why three of five AI surfaces
are unlabeled.

## What counts as an "AI-generated surface" here

Five surfaces, all already shipped except the last:

1. **Doc chat** (`app/chat/page.tsx`) — assistant message bubbles
   (`m.role === "assistant"`, line ~141).
2. **Check-in draft** (`app/check-in/page.tsx`) — the generated draft
   text once `generateCheckinDraft()` has run.
3. **Weekly Analysis** (`components/WeeklyAnalysis.tsx`, shown on
   `app/page.tsx:183`) — the client-facing self-serve analysis.
4. **Document protocol extraction** (`app/documents/page.tsx`, the
   `pending` list around line 228) — the AI-extracted macro/cardio
   prescription a client confirms or rejects.
5. **Coach brief** (new, `components/CoachBrief.tsx` per `specs/
   phase-3-ai-weekly-coach-brief.md`) — build with the badge from the
   start, not retrofitted.

## Component — `components/AiBadge.tsx`

One shared component, not five bespoke labels. **Superseded by the
2026-09-02 addendum below** — the tooltip text needs to be a per-surface
prop, not the hardcoded generic string originally shown here. Original
snippet, for history:

```tsx
export function AiBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent ${className}`}
      title="Drafted by AI — review before relying on it."
    >
      AI-assisted
    </span>
  );
}
```

Matches the existing small-pill visual language already in the codebase
(the program-type pill on `app/clients/[accountId]/page.tsx:85`, the same
`bg-accent/10`/`text-accent` pattern) rather than inventing a new visual
idiom. A `title` tooltip carries the explanation; no separate modal or
help text needed — this is meant to be a quiet, consistent marker, not an
interruption.

## Override/confirm requirement — already met, mostly

The PRD frames labeling alongside "a human override/confirm control." For
four of the five surfaces, that control **already exists** and needs no new
work — the badge is the only addition:

- Document extraction: **Confirm/Reject** buttons already exist
  (`app/documents/page.tsx:265,272`).
- Coach brief: **Approve** + editable textarea, built in Phase 3.
- Check-in draft: already editable before sending (`app/check-in/
  page.tsx`'s form), and "marking it sent" is itself the confirm step.
- Weekly Analysis: no edit control today, and adding one is **out of
  scope here** — see `specs/phase-3-ai-weekly-coach-brief.md`'s
  "Relationship to the existing Weekly Analysis feature" for why this
  surface's lack of a coach gate is a named, deliberate non-goal for this
  pass, not an oversight. The badge still applies; the override control
  does not, for this surface, in this pass.
- **Doc chat is the one surface with no override control, by nature** — an
  answer to a question isn't something you "approve," there's nothing to
  edit-then-confirm. The badge alone satisfies the PRD's intent here; don't
  invent a confirm step for a Q&A surface that doesn't need one.

## Per-surface changes

1. **Doc chat** (`app/chat/page.tsx`): render `<AiBadge />` inline at the
   start of each assistant bubble, before the response text.
2. **Check-in draft** (`app/check-in/page.tsx`): render `<AiBadge />`
   above the generated-draft textarea, once a draft exists.
3. **Weekly Analysis** (`components/WeeklyAnalysis.tsx`): render
   `<AiBadge />` above the analysis text, once `analysis` is non-null.
4. **Document extraction** (`app/documents/page.tsx`): render `<AiBadge
   />` on each pending-extraction row, next to the confidence indicator
   already shown there (check the row's existing markup around line 228
   for where confidence/source-quote is rendered and place it alongside,
   not as a new line).
5. **Coach brief** (`components/CoachBrief.tsx`, built in Phase 3):
   include `<AiBadge />` in the initial build, per Phase 3's §4.

## Test plan (TDD — write these first, per repo convention)

Component tests using the RTL/jsdom setup VIK-100 already landed
(`tests/*.test.tsx` pattern — see `tests/weekly-analysis.test.tsx`,
`tests/compliance-chart.test.tsx` for the existing style):

- `AiBadge` renders its accessible label text ("AI-assisted") and a
  `title` attribute.
- Each of the five surfaces renders exactly one `AiBadge` per AI-generated
  item once that item exists (assistant message / generated draft /
  analysis text / pending extraction row / brief), and renders **none**
  before that content exists (e.g. doc chat's empty state, check-in
  before a draft is generated) — the badge marks AI output, not the
  surface itself.

## Explicitly deferred

- Any change to *what* gets a human-confirm step, beyond labeling what
  already has or lacks one. In particular, not adding an approval gate to
  Weekly Analysis — see "Override/confirm requirement" above.
- A dedicated "what does AI-assisted mean" help/settings page. The
  tooltip is the whole UX for this pass; a fuller explainer is a future
  nice-to-have, not blocking. (Still true after the 2026-09-02 addendum —
  a richer per-surface tooltip is not the same thing as a help page.)

---

## 2026-09-02 — grill-session follow-up (VIK-10)

A `/grill-me` pass surfaced one real gap in the original design: **AI
transparency is a genuine trust-building product principle for real users
on real health data (Heather, Jake, and more testers coming), not a
demo/pitch talking point to revisit later.** Confirmed with Vik: build it
with real substance now, since retrofitting "why should I trust this"
content later is harder than doing it once, up front.

Concretely, this means `AiBadge`'s tooltip needs to say *what specifically
grounded this output*, not the same generic "drafted by AI, review before
relying on it" string everywhere. Still a `title` tooltip — no new modal,
no help page (see "Explicitly deferred," unchanged) — just a real,
per-surface explanation instead of a placeholder one:

```tsx
export function AiBadge({
  detail,
  className = "",
}: {
  /** What specifically grounded this output — shown in the tooltip. Keep
   *  it short and concrete, e.g. "Grounded in this week's synced macro,
   *  weight, water, and sleep data." Don't fall back to a generic string
   *  — every call site should say what the model actually saw. */
  detail: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent ${className}`}
      title={detail}
    >
      AI-assisted
    </span>
  );
}
```

`detail` becomes a **required** prop (not optional with a generic default)
— forcing every one of the five call sites in "Per-surface changes" above
to say something real is the point; a required prop is what makes that
enforceable rather than aspirational. Per-surface detail text (draft, tune
at implementation time):

1. **Doc chat**: "Grounded in your uploaded documents, with sources cited
   below."
2. **Check-in draft**: "Grounded in this week's synced data and your own
   notes."
3. **Weekly Analysis**: "Grounded in this week's synced macro, weight,
   water, and sleep data."
4. **Document extraction**: "Extracted from the uploaded document — review
   before confirming."
5. **Coach brief**: "Grounded in this week's synced data" (extend to
   mention protocol history once `specs/
   phase-3-ai-weekly-coach-brief.md`'s protocol-history grounding lands;
   extend again to mention document sources once `specs/
   phase-3-document-grounding.md` lands — the tooltip text is expected to
   grow as the brief's own grounding does, not a one-time string).

This changes `AiBadge`'s public interface (already built, PR not yet
merged) — updating it is a follow-up commit on that same branch, not a new
component or a breaking migration for callers that don't exist yet.
