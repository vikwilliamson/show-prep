/**
 * Applies drizzle migrations against DATABASE_URL. The only place
 * migrations run against Postgres now (see AGENTS.md's "Migrations"
 * section) — not implicitly at app boot. vercel.json's buildCommand runs
 * this before `next build` on every deployment; `pnpm db:reset-staging`
 * also calls it (via lib/reset-staging.ts) after wiping the staging schema.
 *
 * Run with: pnpm db:migrate
 */
import { runMigrations } from "../lib/db/migrate";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL must be set to run migrations against Postgres.");
  process.exit(1);
}

runMigrations(databaseUrl)
  .then(() => {
    console.log("Migrations applied.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
