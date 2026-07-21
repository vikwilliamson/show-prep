# Show Prep

NPC bodybuilding contest-prep management. A Next.js app that turns coach
documents into a confirmed "active protocol", ingests real nutrition/health
data from Health Connect via an Android companion app, and closes the loop
with a compliance dashboard, an AI weekly analysis, and a generated coach
check-in.

Monorepo layout (pnpm workspaces):

- **`/`** — Next.js 16 (App Router) + TypeScript + Drizzle + PostgreSQL web app
- **`/mobile`** — Expo (React Native) Health Connect companion for Android
  ([its README](mobile/README.md))

Architecture spec: see `SHOW-APP-ARCHITECTURE.md` (Fitness Data Hub).

## Features

- **Documents** — upload coach PDFs/txt or paste emails. Claude
  (`claude-opus-4-8`) extracts structured prescriptions (calories, P/C/F,
  effective date, cardio plan); you review and **confirm** before one becomes
  the active protocol. Division rules/guidelines are just another document
  category.
- **Dashboard** — countdown to show date, current weight vs target stage
  weight with a 7-day trend, daily macro compliance vs the active protocol,
  and an AI-written plain-language weekly analysis.
- **Check-in** — answers your coach's exact template (stored as app config):
  data-backed questions (macro adherence, bodyweight, water ≥3L, sleep ≥7h,
  workouts ≥3/wk & cardio, next competition) are pre-filled from ingested
  data; subjective ones (waist, strength, digestion, change requests) are
  manual fields saved to `check_ins`. Thresholds live in the `weekly_targets`
  table (Settings page). Output: a copyable/mailable filled-in template.
- **Doc chat** — RAG over your uploads (Voyage AI `voyage-4` embeddings,
  1024-dim, pgvector), with source citations.
- **Weight-cap calculator** — deterministic NPC Classic Physique
  height-to-weight-cap lookup (official 2023 chart), no AI.
- **Ingest API** — `/api/ingest/{nutrition|weight|hydration|sleep|exercise|activity}`,
  Zod-validated, bearer-token-gated, idempotent (upserts on Health Connect
  record UIDs).

## Quick start

```bash
pnpm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY + VOYAGE_API_KEY for AI features
pnpm seed                    # optional: 35 days of demo data (run with dev server stopped)
pnpm dev
```

No database setup needed: without `DATABASE_URL` the app runs an embedded
PGlite (WASM Postgres, pgvector included) at `.data/pglite`. Point
`DATABASE_URL` at a real Postgres (with the pgvector extension) to use one —
same Drizzle schema/migrations either way.

> PGlite is single-process: stop the dev server before running `pnpm seed`,
> and vice versa.

## Commands

| Command | What |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm seed` | demo data (35 days, active + pending protocol) |
| `pnpm test` | unit tests (calculator, dates, chunking) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | regenerate Drizzle migrations after schema changes |

## Configuration

All optional — see `.env.example`. `INGEST_API_KEY` protects the ingest API
(the companion app sends it as a bearer token). `APP_PASSWORD` enables the
single-user login gate; leave unset for none.

Day bucketing is done in `America/Los_Angeles` (configurable in Settings):
timestamps are stored as UTC and each row also stores its `local_date`,
computed at ingest.

## Data flow

```
MyFitnessPal ─┐
              ├→ Health Connect (on-device) → mobile companion (batched POST)
Samsung Health┘        → /api/ingest/* → Postgres → dashboard / check-ins

Coach docs → upload → Claude extraction → pending protocol → user confirms
          → active protocol (compliance baseline)
          → chunked + embedded (voyage-4) → doc chat (RAG)
```
