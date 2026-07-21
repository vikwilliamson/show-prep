import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations are applied programmatically at runtime (lib/db/index.ts),
  // so no dbCredentials are needed for `drizzle-kit generate`.
});
