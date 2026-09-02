import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
    // PGlite is single-process (see README) — several tests share the local
    // .data/pglite dev database, so test files can't run in parallel.
    fileParallelism: false,
    env: {
      SESSION_SECRET: "test-session-secret-do-not-use-in-prod",
    },
  },
});
