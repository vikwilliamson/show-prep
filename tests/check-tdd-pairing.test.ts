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

function commitFile(relativePath: string, contents: string) {
  stageFile(relativePath, contents);
  execFileSync("git", ["commit", "-q", "-m", relativePath], { cwd: repoDir });
}

function runScript(...args: string[]): { status: number | null; stdout: string } {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], { cwd: repoDir, encoding: "utf-8" });
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

// CI invokes the script with `--range A...B` instead of inspecting staged
// files (see ci.yml's "TDD pairing check" step) — exercise that path too.
test("--range mode fails when a scripts/* file changes with no paired test", () => {
  commitFile("README.md", "# hello\n");
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf-8" }).trim();
  commitFile("scripts/seed.ts", "export const seed = () => {};\n");

  const { status } = runScript("--range", `${base}...HEAD`);
  assert.equal(status, 1);
});

test("--range mode passes when a scripts/* file changes alongside a paired test", () => {
  commitFile("README.md", "# hello\n");
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf-8" }).trim();
  commitFile("scripts/seed.ts", "export const seed = () => {};\n");
  commitFile("tests/seed.test.ts", "// paired test\n");

  const { status } = runScript("--range", `${base}...HEAD`);
  assert.equal(status, 0);
});

// Regression cases for VIK-118: the old gate only checked "some test file
// changed somewhere," so an unrelated test elsewhere in the diff satisfied
// it. These reproduce the PR #1 / #3 / #30 patterns that slipped through.

test("fails when lib/ and app/ change but the only test file is unrelated (PR #1 pattern)", () => {
  stageFile("lib/db-sync.ts", "export const sync = () => {};\n");
  stageFile("app/api/session/route.ts", "export const GET = () => {};\n");
  stageFile("tests/unrelated-thing.test.ts", "// covers something else entirely\n");

  const { status } = runScript();
  assert.equal(status, 1);
});

test("fails when lib/ files change but the only new test is a trivial unrelated one (PR #3 pattern)", () => {
  stageFile("lib/ai/analysis.ts", "export const analyze = () => {};\n");
  stageFile("lib/rag.ts", "export const retrieve = () => {};\n");
  stageFile("tests/new-thing.test.ts", "// 3 trivial assertions, unrelated basename\n");

  const { status } = runScript();
  assert.equal(status, 1);
});

test("passes when at least one lib/ change has a correlated test, even if not every file does", () => {
  stageFile("lib/ai/analysis.ts", "export const analyze = () => {};\n");
  stageFile("lib/rag.ts", "export const retrieve = () => {};\n");
  stageFile("tests/rag.test.ts", "// covers lib/rag.ts\n");

  const { status } = runScript();
  assert.equal(status, 0);
});

test("fails when components/ change has no related test at all (PR #30 pattern)", () => {
  stageFile("components/client-page.tsx", "export function ClientPage() { return null; }\n");
  stageFile("tests/rag.test.ts", "// unrelated area entirely\n");

  const { status } = runScript();
  assert.equal(status, 1);
});

test("passes when a scripts/* file is paired with a test whose basename is a superset (e.g. seed-data)", () => {
  stageFile("scripts/seed.ts", "export const seed = () => {};\n");
  stageFile("tests/seed-data.test.ts", "// broader test that also covers seed.ts\n");

  const { status } = runScript();
  assert.equal(status, 0);
});

test("passes when a nested app/api route is paired with the repo's route-test naming convention", () => {
  stageFile("app/api/documents/[id]/route.ts", "export const GET = () => {};\n");
  stageFile("tests/documents-id-route.test.ts", "// covers the [id] route\n");

  const { status } = runScript();
  assert.equal(status, 0);
});
