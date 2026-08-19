# Phase 0 — Generalize Terminology & Nav — Build Spec
**Source:** `specs/v3-build-spec.md` Phase 0, refined via a follow-up scoping
pass, 2026-08-18 — exhaustive re-scan of `app/`, `lib/`, `components/` on the
current `v3-generalized` branch (post client-account-foundation merge).
**This pass covers:** the in-place rename of bodybuilding-specific data model
fields, types, API payloads, and UI copy to generic coaching terminology, and
full removal of the Weight Cap feature.
**Effort:** `xhigh` per `CLAUDE.md` — in-place schema/type renames are where a
skipped file is expensive to find later. The scan below is meant to be
exhaustive; flag anything it missed before merging.

---

## Decisions locked in before this spec

- **Weight Cap removal is total**: both calculators (Classic Physique *and*
  general bodybuilding weight class), route, nav entry, dashboard tile, and
  backing lib files — not just the one literally named "Weight Cap."
- **`divisions` → `programType`, single-select, not multi-select.** The
  current schema/UI (`settings.divisions: text[]`, cross-competing
  checkboxes) is a bodybuilding-specific accommodation that doesn't map onto
  general coaching program types. `programType` becomes a single `text`
  field with a single-select UI.
- Show-terminology fields get the same in-place-rename treatment as
  `divisions`, not just copy genericization (per the earlier scope review).

## Naming

| Old | New |
|---|---|
| `settings.divisions` (`text[]`) | `settings.programType` (`text`, nullable) |
| `settings.showName` | `settings.targetName` |
| `settings.showDate` | `settings.targetDate` |
| `stats.daysToShow` | `stats.daysToTarget` |
| `documents.category` value `division_rules` | `program_rules` |
| `lib/divisions.ts` (file) | `lib/program-types.ts` |
| `DIVISIONS`, `Division`, `DIVISION_LABELS`, `divisionLabel()` | `PROGRAM_TYPES`, `ProgramType`, `PROGRAM_TYPE_LABELS`, `programTypeLabel()` |

`targetDate`/`daysToTarget` deliberately match the vocabulary
`specs/v3-build-spec.md`'s own Phase 1 already uses ("Countdown timer to
target date") — Phase 1 can consume this field as-is with no further rename.

New `PROGRAM_TYPES` value set (replacing the six specific bodybuilding
divisions with one umbrella option, per the parent spec's own example):
`["physique_prep", "weight_loss", "general_coaching"]`.

`DIVISION_WEIGHT_CAPS`/`DIVISION_WEIGHT_CLASSES` are **deleted**, not
renamed — that lookup functionality goes away with Weight Cap.

`settings.heightInches` **survives** (Phase 1 lists height as a config
field) — just update its stale `// for Classic Physique weight-cap calc`
comment.

**Update, 2026-08-19**: `settings.nextCompetitionNote` → `targetNote` after
all, per Vik — it did start to read oddly next to `targetName`/`targetDate`.
Same treatment downstream: the `lib/ai/analysis.ts` local variable and the
`checkin-template.ts`/`dataAnswers()` question key both went from
`nextCompetition`/`next_competition` to `nextTarget`/`next_target`, and the
check-in question itself was reworded from "What is your next competition/
event/goal/date?" to "What is your next goal or target date?".

## File-by-file checklist (from an exhaustive `grep`, not a sample)

**Delete:**
- `app/calculator/` (whole route)
- `components/CapCalculator.tsx`, `components/BodybuildingClassCalculator.tsx`
- `lib/classic-physique.ts`, `lib/bodybuilding.ts`
- `tests/classic-physique.test.ts`, `tests/bodybuilding.test.ts`

**Rename:**
- `lib/divisions.ts` → `lib/program-types.ts`

**Schema** (`lib/db/schema.ts`):
- `settings.divisions` → `settings.programType`; `showName`/`showDate` →
  `targetName`/`targetDate`
- `documents.category` enum literal `division_rules` → `program_rules`
  (comment + enum array)
- Comment `// coach_protocol: macro/cardio/peak-week docs from coach` →
  generic

**App routes/pages:**
- `app/page.tsx` — remove the weight-cap/class stat tile block entirely
  (the `caps`/`classes` computation and its JSX); `settings.divisions` →
  `settings.programType` (single value, not mapped array) wherever else
  referenced; `"Show day"` tile label, `daysToShow` → `daysToTarget`
- `app/settings/page.tsx` — divisions checkboxes → single select for
  `programType`; `showName`/`showDate` labels ("Show name"/"Show date") →
  generic (e.g. "Target name"/"Target date"); import from
  `lib/program-types.ts`
- `app/api/settings/route.ts` — zod schema: `divisions: z.array(...)` →
  `programType: z.string().optional()`; `showName`/`showDate` → `targetName`/
  `targetDate`
- `app/api/documents/route.ts` — `CATEGORIES` set + type literal
  `division_rules` → `program_rules`
- `app/documents/page.tsx` — label `"Division rules"` → generic (e.g.
  "Program rules"), dropdown option value, and the "NPC division rules"
  empty-state copy
- `app/chat/page.tsx` — placeholder text ("division rules…", "peak week
  sodium", "posing") → generic examples
- `app/login/page.tsx` — portfolio demo description still says "...document
  chat, and weight-cap calculator" — drop that clause

**lib/:**
- `lib/stats.ts` — `daysToShow` field + calc → `daysToTarget`
- `lib/ai/analysis.ts` — `settings.showName`/`showDate`/`divisions` →
  `targetName`/`targetDate`/`programType` in the AI context payload and the
  `nextCompetition` string builder
- `lib/ai/extract.ts` — "peak week"/"posing" extraction instructions →
  generic ("final-phase adjustments" or similar; posing has no general-
  coaching analog, drop it rather than replace it)
- `lib/rag.ts` — `CHAT_SYSTEM` prompt fully rewritten: currently frames the
  user as "a bodybuilding competitor" asking about "division rules/
  guidelines (e.g. NPC Classic Physique)" and references "peak week" — needs
  a generic-coaching rewrite, not a word-swap
- `lib/checkin-template.ts` — top comment "the athlete" → "the client"
  (optional, low-stakes); `next_competition` question's `note: "Pulled from
  show settings."` → "Pulled from target settings."

**components/:**
- `components/NavLinks.tsx` — remove the `/calculator` → "Weight Cap" link

**scripts/seed.ts** — required, not optional (this demo content currently
violates `AGENTS.md`'s own banned-terminology list):
- Field renames: `showName`/`showDate`/`divisions` → `targetName`/
  `targetDate`/`programType` (single value)
- `category: "division_rules"` → `"program_rules"`
- `PEAK_WEEK_TEXT` (entire doc is a "PEAK WEEK PROTOCOL" with posing
  references) and `RULES_TEXT` (entire doc is "NPC CLASSIC PHYSIQUE —
  DIVISION RULES," posing/tanning judging criteria) — rewrite as generic
  coaching-program content (e.g. a general phase-transition adjustment doc
  and a general program-guidelines reference doc). Copy strings elsewhere
  in the file ("we make the show," "show day," "posing suits
  (Bodybuilding)") get the same treatment. Document titles referencing "NPC
  Classic Physique" → generic.

**app/layout.tsx**: page metadata description "NPC bodybuilding contest-prep
management" → generic product description.

## Migration — no data preservation needed

Per Vik: the current `settings`/`documents` data in every environment,
including production, is disposable seed/demo data he generated for his own
testing — nothing worth carrying forward. This changes the migration
approach substantially from the original plan (which assumed real data and a
three-step add/backfill/drop sequence):

- Schema change is a straight two-step drop-then-add (drizzle-kit needs two
  separate `db:generate` passes to avoid its interactive rename-detection
  prompt when a column is dropped and a similarly-shaped one added in the
  same diff — not two passes for data-safety reasons).
- No backfill script, no Neon-branch data-preservation dry run.
- Local dev: wipe `.data/pglite` and reseed via `scripts/seed.ts` for a
  clean slate on the new schema.
- Production: fine to let the migration apply on next deploy and reseed
  (or just start empty) — confirm with Vik before deploying if in doubt, but
  no backup/branch-snapshot ceremony is required here the way it was for
  client-accounts (that one really did carry real-shaped account data).

## Test plan (TDD)

- `lib/program-types.ts`: unit tests for `programTypeLabel()` (replaces the
  `divisionLabel()` tests implicitly covered by the deleted calculator
  tests — those tested the *calculators*, not the label function directly,
  so this needs new coverage)
- `app/api/settings/route.ts`: existing behavior around `programType`/
  `targetName`/`targetDate` validation (reject invalid `programType` values,
  accept nulls)
- No new tests needed for pure copy/prompt-text changes (`lib/rag.ts`,
  `lib/ai/extract.ts`, UI label strings) — nothing testable there beyond
  what existing tests already cover

## Out of scope for this pass

- Any Phase 1/2/3/4 work
