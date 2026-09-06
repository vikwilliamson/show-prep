import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@electric-sql/pglite-pgvector",
    "postgres",
    "unpdf",
  ],
  // Migrations apply as an explicit deploy step now (vercel.json's
  // buildCommand, see AGENTS.md's "Migrations" section), not at runtime —
  // but lib/db/index.ts still reads drizzle/ at boot to fail closed if the
  // schema is out of sync, so the SQL files still need to ship inside the
  // serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**"],
  },
};

export default nextConfig;
