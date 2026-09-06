import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // No dbCredentials needed for `drizzle-kit generate` — it only writes
  // SQL files here, it doesn't apply them. Migrations are applied
  // programmatically by lib/db/migrate.ts (`pnpm db:migrate`), not by
  // drizzle-kit itself. See AGENTS.md's "Migrations" section.
});
