import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@electric-sql/pglite-pgvector",
    "postgres",
    "unpdf",
  ],
  // Migrations are applied at runtime (lib/db/index.ts); make sure the SQL
  // files ship inside the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**"],
  },
};

export default nextConfig;
