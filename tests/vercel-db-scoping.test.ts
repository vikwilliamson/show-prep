import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { reapplyDbScoping, type ConnectionStrings, type EnvSetter } from "../lib/vercel-db-scoping";

// vercelEnvSetter shells out to the real `vercel` CLI — mock the child
// process boundary so these tests can assert on exactly what execFileSync
// is called with, without actually invoking `vercel`.
const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));
const { vercelEnvSetter } = await import("../lib/vercel-db-scoping");

afterEach(() => execFileSyncMock.mockReset());

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

test("vercelEnvSetter never puts the secret value in the child process's CLI arguments", () => {
  execFileSyncMock.mockReturnValue(Buffer.from(""));
  const secret = "postgres://user:hunter2@ep-shy-mode.neon.tech/prod";

  vercelEnvSetter().set("DATABASE_URL", "production", secret);

  assert.equal(execFileSyncMock.mock.calls.length, 1);
  const [command, args] = execFileSyncMock.mock.calls[0];
  assert.equal(command, "vercel");
  assert.ok(
    !(args as string[]).some((arg) => arg.includes(secret)),
    `secret leaked into argv: ${JSON.stringify(args)}`,
  );
});

test("vercelEnvSetter passes the secret value via stdin instead", () => {
  execFileSyncMock.mockReturnValue(Buffer.from(""));
  const secret = "postgres://user:hunter2@ep-shy-mode.neon.tech/prod";

  vercelEnvSetter().set("DATABASE_URL", "production", secret);

  const [, , options] = execFileSyncMock.mock.calls[0];
  assert.equal(options.input, secret, "the secret should be written to the child's stdin, not argv");
});
