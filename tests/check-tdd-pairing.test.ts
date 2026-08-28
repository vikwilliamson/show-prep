import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "vitest";

// The script only inspects `git diff --cached` in the current working
// directory, so a throwaway git repo is enough to drive it without
// touching this repo's own history.

const SCRIPT = path.resolve(import.meta.dirname, "../scripts/check-tdd-pairing.sh");

let repoDir: string;

beforeEach(() => {
  repoDir = mkdtempSync(path.join(tmpdir(), "tdd-pairing-test-"));
  execFileSync("git", ["init", "-q"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

function stageFile(relativePath: string, contents: string) {
  const absolute = path.join(repoDir, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
  execFileSync("git", ["add", relativePath], { cwd: repoDir });
}

function runScript(): { status: number | null; stdout: string } {
  try {
    const stdout = execFileSync("bash", [SCRIPT], { cwd: repoDir, encoding: "utf-8" });
    return { status: 0, stdout };
  } catch (err) {
    const e = err as { status: number | null; stdout: string };
    return { status: e.status, stdout: e.stdout };
  }
}

test("fails when a scripts/* file changes with no paired test", () => {
  stageFile("scripts/seed.ts", "export const seed = () => {};\n");

  const { status } = runScript();
  assert.equal(status, 1);
});

test("passes when a scripts/* file changes alongside a paired test", () => {
  stageFile("scripts/seed.ts", "export const seed = () => {};\n");
  stageFile("tests/seed.test.ts", "// paired test\n");

  const { status } = runScript();
  assert.equal(status, 0);
});

test("still passes when only unrelated files change", () => {
  stageFile("README.md", "# hello\n");

  const { status } = runScript();
  assert.equal(status, 0);
});
