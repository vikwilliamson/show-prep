import assert from "node:assert/strict";
import { test } from "vitest";
import { reapplyDbScoping, type ConnectionStrings, type EnvSetter } from "../lib/vercel-db-scoping";

test("reapplyDbScoping sends production's connection string to production only", () => {
  const calls: Array<{ name: string; environment: string; value: string }> = [];
  const conn: ConnectionStrings = {
    getProduction: () => "postgres://prod-conn",
    getTest: () => "postgres://test-conn",
  };
  const setter: EnvSetter = {
    set: (name, environment, value) => {
      calls.push({ name, environment, value });
    },
  };

  reapplyDbScoping(conn, setter);

  const prodCall = calls.find((c) => c.environment === "production");
  assert.equal(prodCall?.name, "DATABASE_URL");
  assert.equal(prodCall?.value, "postgres://prod-conn");
});

test("reapplyDbScoping sends test's connection string to development only", () => {
  const calls: Array<{ name: string; environment: string; value: string }> = [];
  const conn: ConnectionStrings = {
    getProduction: () => "postgres://prod-conn",
    getTest: () => "postgres://test-conn",
  };
  const setter: EnvSetter = {
    set: (name, environment, value) => {
      calls.push({ name, environment, value });
    },
  };

  reapplyDbScoping(conn, setter);

  const devCall = calls.find((c) => c.environment === "development");
  assert.equal(devCall?.name, "DATABASE_URL");
  assert.equal(devCall?.value, "postgres://test-conn");
});

test("reapplyDbScoping never crosses production's value into development or vice versa", () => {
  const calls: Array<{ environment: string; value: string }> = [];
  const conn: ConnectionStrings = {
    getProduction: () => "postgres://prod-conn",
    getTest: () => "postgres://test-conn",
  };
  const setter: EnvSetter = {
    set: (_name, environment, value) => {
      calls.push({ environment, value });
    },
  };

  reapplyDbScoping(conn, setter);

  for (const call of calls) {
    if (call.environment === "production") assert.notEqual(call.value, "postgres://test-conn");
    if (call.environment === "development") assert.notEqual(call.value, "postgres://prod-conn");
  }
  assert.equal(calls.length, 2);
});
