import assert from "node:assert/strict";
import { test, vi } from "vitest";

// scripts/fix-vercel-db-scoping.ts runs its work as a top-level side effect
// on import (it's a thin CLI wrapper, not an exported function) — mock the
// only real boundary it crosses, node:child_process, so importing it here
// exercises the real wiring (branch -> environment, vercelEnvSetter) without
// shelling out to the real neonctl/vercel CLIs.
const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));

test("fix-vercel-db-scoping wires main->production and test->development, and never puts either connection string in a CLI argument", async () => {
  execFileSyncMock.mockImplementation((command: string, args: string[]) => {
    if (command === "neonctl") {
      const branch = args[1];
      return `postgres://${branch}-branch-conn\n`;
    }
    if (command === "vercel") {
      return "";
    }
    throw new Error(`unexpected command: ${command} ${JSON.stringify(args)}`);
  });

  await import("../scripts/fix-vercel-db-scoping");

  const vercelCalls = execFileSyncMock.mock.calls.filter(([command]) => command === "vercel");
  assert.equal(vercelCalls.length, 2);

  const prodCall = vercelCalls.find(([, args]) => (args as string[]).includes("production"));
  const devCall = vercelCalls.find(([, args]) => (args as string[]).includes("development"));
  assert.ok(prodCall, "expected a vercel env add call for production");
  assert.ok(devCall, "expected a vercel env add call for development");

  // main -> production, test -> development (per the module's own doc comment).
  assert.equal(prodCall![2].input, "postgres://main-branch-conn");
  assert.equal(devCall![2].input, "postgres://test-branch-conn");

  for (const [, args] of [...vercelCalls]) {
    assert.ok(
      !(args as string[]).some((a) => a.includes("-branch-conn")),
      `connection string leaked into vercel argv: ${JSON.stringify(args)}`,
    );
  }
});
