// Centralized environment access. Everything has a sensible dev default so the
// app boots with zero configuration; AI features surface a clear error when
// their keys are missing.
//
// SESSION_SECRET and INGEST_API_KEY gate real endpoints (see proxy.ts,
// lib/ingest/auth.ts) but both no-op — open access — when unset, which is
// deliberate for local dev. To keep that from silently disabling auth on a
// real deploy, both are required whenever process.env.VERCEL is set: this
// module throws at import time (i.e. at boot) rather than letting the app
// come up with auth quietly turned off. Same pattern as lib/db/index.ts's
// DATABASE_URL guard.

import { z } from "zod";

const MIN_SECRET_LENGTH = 16;

const secretSchema = z
  .string()
  .min(
    MIN_SECRET_LENGTH,
    `must be at least ${MIN_SECRET_LENGTH} characters`,
  )
  .optional();

const rawEnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().optional(),
  INGEST_API_KEY: secretSchema,
  ANTHROPIC_MODEL: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
  VOYAGE_MODEL: z.string().optional(),
  SESSION_SECRET: secretSchema,
});

const REQUIRED_IN_PROD = ["SESSION_SECRET", "INGEST_API_KEY"] as const;

function parseEnv(source: NodeJS.ProcessEnv) {
  const result = rawEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  if (source.VERCEL) {
    const missing = REQUIRED_IN_PROD.filter((key) => !result.data[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required production environment variable(s): ${missing.join(", ")}. ` +
          "These fail open (auth disabled) when unset, so they're required " +
          "whenever process.env.VERCEL is set.",
      );
    }
  }

  return result.data;
}

const parsed = parseEnv(process.env);

export const env = {
  /** Postgres connection string. When unset, an embedded PGlite database is used. */
  databaseUrl: parsed.DATABASE_URL,
  /** Directory for the embedded PGlite database. */
  pgliteDir: parsed.PGLITE_DIR ?? ".data/pglite",
  /** Bearer token the mobile companion must send to /api/ingest/*. */
  ingestApiKey: parsed.INGEST_API_KEY,
  /** Claude model for extraction/analysis/chat. */
  anthropicModel: parsed.ANTHROPIC_MODEL ?? "claude-opus-4-8",
  /** Voyage AI key for embeddings (voyage-4). */
  voyageApiKey: parsed.VOYAGE_API_KEY,
  voyageModel: parsed.VOYAGE_MODEL ?? "voyage-4",
  /** Secret used to sign per-account session cookies (see lib/auth.ts). When unset, the login gate is disabled. */
  sessionSecret: parsed.SESSION_SECRET,
};
