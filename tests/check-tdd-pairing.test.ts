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

// Code review on VIK-118's own PR found the substring match had no word-
// boundary check: lib/ingest/auth.ts (a "core infrastructure" path) slugs
// to "ingest-auth", which contains "auth" as a trailing substring — so a
// commit touching it plus tests/auth.test.ts (real coverage for the
// unrelated lib/auth.ts) was wrongly accepted as correlated. This is the
// PR #1/#3/#30 failure mode recreated for nested-vs-top-level basename
// collisions, exactly what this gate exists to close.

test("fails when lib/ingest/auth.ts changes and the only test is unrelated lib/auth.ts coverage (basename-suffix collision)", () => {
  stageFile("lib/ingest/auth.ts", "export const ingestAuth = () => {};\n");
  stageFile("tests/auth.test.ts", "// covers lib/auth.ts, not lib/ingest/auth.ts\n");

  const { status } = runScript();
  assert.equal(status, 1);
});

test("passes when lib/auth.ts itself changes alongside tests/auth.test.ts", () => {
  stageFile("lib/auth.ts", "export const auth = () => {};\n");
  stageFile("tests/auth.test.ts", "// covers lib/auth.ts\n");

  const { status } = runScript();
  assert.equal(status, 0);
});

test("passes when lib/ingest/auth.ts changes alongside a test actually named for it", () => {
  stageFile("lib/ingest/auth.ts", "export const ingestAuth = () => {};\n");
  stageFile("tests/ingest-auth.test.ts", "// covers lib/ingest/auth.ts\n");

  const { status } = runScript();
  assert.equal(status, 0);
});

// The repo's own route-to-test naming isn't fully consistent: [id] routes
// keep the segment literally (documents-id-route, tested above), but
// app/api/clients/[accountId]/... routes drop the bracketed segment
// entirely (tests/clients-brief-route.test.ts, tests/clients-dashboard-
// route.test.ts already exist this way). The gate must accept both.

test("passes when a bracketed dynamic segment is dropped in the test name, matching this repo's own convention", () => {
  stageFile("app/api/clients/[accountId]/brief/route.ts", "export const GET = () => {};\n");
  stageFile("tests/clients-brief-route.test.ts", "// covers the [accountId] route\n");

  const { status } = runScript();
  assert.equal(status, 0);
});

// scripts/* isn't only .ts -- this very script is scripts/check-tdd-
// pairing.sh. Token-sequence matching requires exact token equality, so
// a leftover ".sh" glued onto the last token (if extension-stripping only
// handled .ts/.tsx) would break the match against the extension-free test
// slug. This is a real self-check the script's own PR must pass.

test("passes when a scripts/*.sh file is paired with its test (non-.ts source extension)", () => {
  stageFile("scripts/check-tdd-pairing.sh", "#!/usr/bin/env bash\n");
  stageFile("tests/check-tdd-pairing.test.ts", "// covers the .sh script\n");

  const { status } = runScript();
  assert.equal(status, 0);
});

// React components in this repo are conventionally PascalCase
// (components/ComplianceChart.tsx) while tests/ is conventionally
// kebab-case (tests/compliance-chart.test.tsx) — every real components/
// test file follows this (ai-badge, form-field, weekly-analysis, ...).
// Without PascalCase->kebab-case normalization, "ComplianceChart" never
// token-matches "compliance-chart" at all, so VIK-91 found this gate
// rejecting every multi-word component regardless of test coverage.

test("passes when a PascalCase component is paired with its kebab-case test (real repo convention)", () => {
  stageFile("components/ComplianceChart.tsx", "export function ComplianceChart() { return null; }\n");
  stageFile("tests/compliance-chart.test.tsx", "// covers ComplianceChart\n");

  const { status } = runScript();
  assert.equal(status, 0);
});

test("passes for a two-letter-prefix PascalCase component (AiBadge -> ai-badge)", () => {
  stageFile("components/AiBadge.tsx", "export function AiBadge() { return null; }\n");
  stageFile("tests/ai-badge.test.tsx", "// covers AiBadge\n");

  const { status } = runScript();
  assert.equal(status, 0);
});

test("still fails a PascalCase component with no related test at all", () => {
  stageFile("components/ComplianceChart.tsx", "export function ComplianceChart() { return null; }\n");
  stageFile("tests/rag.test.ts", "// unrelated area entirely\n");

  const { status } = runScript();
  assert.equal(status, 1);
});
