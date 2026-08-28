import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

// lib/env.ts validates at module load, so each scenario needs its own fresh
// import after stubbing process.env — vi.resetModules() forces re-evaluation.
async function loadEnv() {
  vi.resetModules();
  return import("../lib/env");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("dev: SESSION_SECRET and INGEST_API_KEY may be unset", async () => {
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("SESSION_SECRET", undefined);
  vi.stubEnv("INGEST_API_KEY", undefined);

  const { env } = await loadEnv();
  assert.equal(env.sessionSecret, undefined);
  assert.equal(env.ingestApiKey, undefined);
});

test("prod: throws at init when SESSION_SECRET is unset", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("SESSION_SECRET", undefined);
  vi.stubEnv("INGEST_API_KEY", "a-perfectly-fine-ingest-key");

  await assert.rejects(loadEnv(), /SESSION_SECRET/);
});

test("prod: throws at init when INGEST_API_KEY is unset", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("SESSION_SECRET", "a-perfectly-fine-session-secret");
  vi.stubEnv("INGEST_API_KEY", undefined);

  await assert.rejects(loadEnv(), /INGEST_API_KEY/);
});

test("prod: boots when both secrets are set and long enough", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("SESSION_SECRET", "a-perfectly-fine-session-secret");
  vi.stubEnv("INGEST_API_KEY", "a-perfectly-fine-ingest-key");

  const { env } = await loadEnv();
  assert.equal(env.sessionSecret, "a-perfectly-fine-session-secret");
  assert.equal(env.ingestApiKey, "a-perfectly-fine-ingest-key");
});

test("rejects a secret shorter than the minimum length, even in dev", async () => {
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("SESSION_SECRET", "too-short");
  vi.stubEnv("INGEST_API_KEY", undefined);

  await assert.rejects(loadEnv(), /SESSION_SECRET/);
});
