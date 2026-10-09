import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  CONSENT_COPY,
  CONSENT_VERSION,
  clearConsent,
  hasConsent,
  loadConsent,
  saveConsent,
} from "../src/consent";
import { __dump, __reset } from "./mocks/async-storage";

beforeEach(() => {
  __reset();
});

test("no consent is recorded on a fresh install", async () => {
  assert.equal(await loadConsent(), null);
  assert.equal(await hasConsent(), false);
});

test("saveConsent records the current copy version and when it was accepted", async () => {
  const record = await saveConsent(new Date("2026-10-08T12:00:00Z"));
  assert.deepEqual(record, { version: CONSENT_VERSION, acceptedAt: "2026-10-08T12:00:00.000Z" });
  assert.deepEqual(await loadConsent(), record);
  assert.equal(await hasConsent(), true);
});

test("consent given to an older version of the copy no longer counts", async () => {
  __dump().set(
    "companion.consent",
    JSON.stringify({ version: CONSENT_VERSION - 1, acceptedAt: "2026-01-01T00:00:00.000Z" }),
  );
  assert.equal(await hasConsent(), false);
});

test("a corrupt stored record counts as no consent instead of throwing", async () => {
  __dump().set("companion.consent", "{not json");
  assert.equal(await loadConsent(), null);
  assert.equal(await hasConsent(), false);

  __dump().set("companion.consent", JSON.stringify({ version: "1" }));
  assert.equal(await hasConsent(), false);
});

test("clearConsent withdraws consent", async () => {
  await saveConsent();
  await clearConsent();
  assert.equal(await hasConsent(), false);
  assert.equal(await loadConsent(), null);
});

test("the copy says what's collected, how it's processed, and where it's stored", () => {
  const text = [CONSENT_COPY.intro, ...CONSENT_COPY.sections.map((s) => `${s.heading} ${s.body}`)]
    .join(" ")
    .toLowerCase();
  for (const topic of ["weight", "sleep", "water", "steps", "nutrition"]) {
    assert.ok(text.includes(topic), `copy should mention ${topic}`);
  }
  assert.match(text, /processor|on our behalf/);
  assert.match(text, /stored/);
  assert.match(text, /coach/);
  assert.match(text, /withdraw|revoke/);
});

test("the copy is vendor-neutral and never says the contact fields it doesn't send", () => {
  const all = JSON.stringify(CONSENT_COPY).toLowerCase();
  assert.doesNotMatch(all, /open wearables|openwearables|terra|svix/);
  // Identification claim must stay true to AGENTS.md's data-handling rule.
  assert.match(all, /opaque|random id|anonymous/);
});
