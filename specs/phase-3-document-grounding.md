# Phase 3 — Coach Brief Document Grounding — Build Spec (Deferred)

**Status: deferred, not scheduled.** Split out from `specs/
phase-3-ai-weekly-coach-brief.md` during a 2026-09-02 `/grill-me` pass so it
doesn't get bundled into (and slow down) the demo-critical brief work
tracked under VIK-9/VIK-103–109. This spec exists so the idea has a real
home and a real ticket, not so it gets built next. Pick this up only after
the core coach brief (VIK-9's chain) has shipped and the protocol-history
grounding addition (folded into VIK-104) is live.

**Depends on:** the core coach brief (`specs/
phase-3-ai-weekly-coach-brief.md`) being built — this extends
`generateCoachBrief()`, it doesn't replace it. Reuses `lib/rag.ts`'s
existing embedding/retrieval infrastructure (built for doc chat,
`specs/v3-build-spec.md`'s Phase 1 work) rather than building a second
retrieval system.

---

## Problem Statement

The coach brief (`lib/ai/brief.ts`'s `generateCoachBrief()`) is grounded
only in computed numbers — macros, weight, water, sleep, training, and
(once the protocol-history addition lands) recent protocol changes. It
can't reference what a coach document actually *said* — e.g. a specific
instruction from an uploaded plan, a rule from the program guidelines, a
note from a prior check-in thread. A coach reading the brief today gets
"adherence dropped this week" but not "adherence dropped, and this is the
week the final-phase carb-cycling protocol kicked in, which the July 6th
plan document said to expect." The numbers-only brief is useful but
shallower than what a coach could write themself with the documents open.

## Solution

Extend `generateCoachBrief()` to retrieve and cite relevant content from
the client's own uploaded documents — the same underlying corpus doc chat
(`app/chat/page.tsx`, `lib/rag.ts`) already searches — so the brief can
ground specific claims in what a coach document actually says, with the
same "cited sources" transparency doc chat already has.

## User Stories

1. As a coach reading a generated brief, I want it to reference relevant
   content from documents I've uploaded for this client (not just
   computed numbers), so that the brief reflects the full context I'd
   otherwise have to remember myself.
2. As a coach, I want any document-grounded claim in the brief to show
   which document it came from, so that I can verify it before approving
   rather than trusting it blindly (same transparency bar as doc chat's
   cited sources).
3. As a coach, I want the brief to *not* hallucinate a connection to a
   document when none genuinely exists — an ungrounded flag stated
   plainly is better than a false citation.
4. As the person maintaining this system, I want the retrieval strategy
   for "what's relevant to this client's week" to be a real, considered
   design (not a copy-paste of doc chat's question-answering retrieval),
   since a brief has no natural user question to search against the way a
   chat message does.

## Implementation Decisions

- **The core open design question this spec doesn't resolve yet:** what
  do you actually search for when there's no user question? Doc chat's
  `retrieve()` takes a query string derived from what the user typed;
  a coach brief has nothing equivalent. Candidate approaches to evaluate
  when this is picked up (not decided here):
  - Retrieve against a synthesized query built from the week's computed
    flags (e.g. "protocol change adherence carb cycling" if that's what
    the numbers suggest is relevant) — cheap, but only as good as the
    flag-to-query mapping.
  - Retrieve against *recency* instead of semantic relevance — pull the
    most recently uploaded/effective document(s) regardless of query,
    since "what changed most recently" is often what's actually relevant
    to a given week. Simpler, more deterministic, possibly misses older-
    but-still-relevant context.
  - Some combination: recency-biased retrieval, with the numbers-derived
    query as a secondary relevance signal.
  Whoever picks this up should spike/compare these against real client
  documents before committing, the same way the Open Wearables spike
  (`specs/phase-2-nutrition.md`) was time-boxed before the mapper got
  written — don't design this blind.
- **Citation format**: match doc chat's existing "cited sources" pattern
  (`app/chat/page.tsx`'s `m.sources`) rather than inventing a new one —
  same underlying `document_chunks` provenance data is available.
- **Hallucination guardrail**: the system prompt must explicitly instruct
  the model to state a claim as ungrounded/computed-only rather than
  inventing a document citation when retrieval doesn't surface anything
  relevant — mirrors the existing "only reference numbers present in the
  data" discipline already in every AI function in `lib/ai/`, extended to
  documents.
- **No schema change anticipated** — `document_chunks`'s existing
  embedding/HNSW-index infrastructure (VIK-81) is reused as-is; this is
  additive to `generateCoachBrief()`'s prompt construction, not a new
  table.

## Testing Decisions

- Mock `lib/rag.ts`'s `retrieve()` the same way `tests/rag.test.ts`
  already tests it elsewhere — fixed fake embeddings/chunks, not a real
  Voyage call.
- A test asserting a fabricated retrieval result's content appears in the
  brief's prompt payload (grounding check, same shape as the existing
  `tests/brief.test.ts` numbers-grounding assertions).
- A test asserting that when retrieval returns nothing relevant, the
  system prompt still instructs against inventing a citation (can't fully
  assert the model's behavior without a real call, but the prompt
  construction itself is testable).

## Out of Scope

- Redesigning doc chat's own retrieval to be shared/generalized with this
  new use case — reuse `retrieve()` as-is; a shared abstraction is only
  worth it once there are two real, working callers, not speculatively
  now.
- Any UI change beyond what the brief review panel (`components/
  CoachBrief.tsx`) already has — citations render as part of the brief
  text/metadata, no new screen.
- Real-time/streaming retrieval or caching optimization — this runs
  on-demand alongside the rest of brief generation, same latency
  characteristics as the numbers-only version.

## Further Notes

- This is explicitly the kind of thing the 2026-09-02 grill session's
  process rule exists for: "don't quietly drop deferred scope, write it
  down properly." This doc is that write-down. Don't let its existence be
  mistaken for scheduling — check the `Gamma` Linear project for whether
  this has actually been picked up before assuming it has.
