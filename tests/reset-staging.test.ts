import assert from "node:assert/strict";
import { test } from "vitest";
import { buildSeedEnv, resetStaging, type SchemaClient } from "../lib/reset-staging";

test("buildSeedEnv sets DATABASE_URL and SEED_AI without mutating the base env", () => {
  const base = { NODE_ENV: "test" as const, PATH: "/usr/bin", DATABASE_URL: "postgres://local" };
  const result = buildSeedEnv(base, "postgres://staging");

  assert.equal(result.DATABASE_URL, "postgres://staging");
  assert.equal(result.SEED_AI, "1");
  assert.equal(result.PATH, "/usr/bin");
  assert.equal(base.DATABASE_URL, "postgres://local");
});

test("resetStaging wipes the schema before seeding, using the staging connection string throughout", async () => {
  const calls: string[] = [];
  const statements: string[] = [];
  let seedEnv: NodeJS.ProcessEnv | undefined;

  const fakeSql: SchemaClient = {
    unsafe: async (s: string) => {
      statements.push(s);
    },
    end: async () => {
      calls.push("end");
    },
  };

  await resetStaging({
    getConnectionString: () => "postgres://staging-conn",
    connectSql: (url) => {
      calls.push(`connect:${url}`);
      return fakeSql;
    },
    runSeed: (env) => {
      seedEnv = env;
      calls.push("seed");
    },
  });

  assert.deepEqual(statements, ["DROP SCHEMA public CASCADE", "CREATE SCHEMA public"]);
  assert.deepEqual(calls, ["connect:postgres://staging-conn", "end", "seed"]);
  assert.equal(seedEnv?.DATABASE_URL, "postgres://staging-conn");
  assert.equal(seedEnv?.SEED_AI, "1");
});

test("resetStaging never seeds if the schema wipe throws", async () => {
  let seedCalled = false;
  const fakeSql: SchemaClient = {
    unsafe: async () => {
      throw new Error("boom");
    },
    end: async () => {},
  };

  await assert.rejects(
    resetStaging({
      getConnectionString: () => "postgres://staging-conn",
      connectSql: () => fakeSql,
      runSeed: () => {
        seedCalled = true;
      },
    }),
  );
  assert.equal(seedCalled, false);
});

test("resetStaging always closes the connection, even if the wipe throws", async () => {
  let ended = false;
  const fakeSql: SchemaClient = {
    unsafe: async () => {
      throw new Error("boom");
    },
    end: async () => {
      ended = true;
    },
  };

  await assert.rejects(
    resetStaging({
      getConnectionString: () => "postgres://staging-conn",
      connectSql: () => fakeSql,
      runSeed: () => {},
    }),
  );
  assert.equal(ended, true);
});
