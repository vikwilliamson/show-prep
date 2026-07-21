// Centralized environment access. Everything has a sensible dev default so the
// app boots with zero configuration; AI features surface a clear error when
// their keys are missing.

export const env = {
  /** Postgres connection string. When unset, an embedded PGlite database is used. */
  databaseUrl: process.env.DATABASE_URL,
  /** Directory for the embedded PGlite database. */
  pgliteDir: process.env.PGLITE_DIR ?? ".data/pglite",
  /** Bearer token the mobile companion must send to /api/ingest/*. */
  ingestApiKey: process.env.INGEST_API_KEY,
  /** Claude model for extraction/analysis/chat. */
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
  /** Voyage AI key for embeddings (voyage-4). */
  voyageApiKey: process.env.VOYAGE_API_KEY,
  voyageModel: process.env.VOYAGE_MODEL ?? "voyage-4",
  /** Optional single-user password. When unset, no login is required. */
  appPassword: process.env.APP_PASSWORD,
};
