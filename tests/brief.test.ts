import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import type { WeekStats } from "../lib/stats";
import type { Settings } from "../lib/db/schema";

// generateCoachBrief() calls client.messages.create() — mock at that seam so
// the test can inspect the exact prompt payload sent to the model, the same
// approach tests/extract.test.ts used for VIK-84.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../lib/ai/client", () => ({
  getAnthropic: () => ({ messages: { create: createMock } }),
  MODEL: "test-model",
  AI_MESSAGE_DEFAULTS: { max_tokens: 16000, thinking: { type: "adaptive" } },
  extractText: (response: { content: { type: string; text?: string }[] }) =>
    response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n"),
}));

const { generateCoachBrief } = await import("../lib/ai/brief");

// Without this, mock.calls[0] in a later test silently reads an earlier
// test's captured call args (createMock is a module-level shared mock) —
// each test needs its own clean call history to assert against.
afterEach(() => createMock.mockClear());

const STATS: WeekStats = {
  weekStart: "2026-08-24",
  weekEnd: "2026-08-30",
  protocol: null,
  targets: {
    id: 1,
    accountId: 1,
    waterMlMin: 3000,
    sleepHoursMin: 7,
    workoutsPerWeekMin: 3,
    cardioSessionsPerWeek: 4,
  },
  nutrition: {
    days: [],
    daysLogged: 5,
    avg: { calories: 2143, proteinG: 205, carbsG: 190, fatG: 58 },
    onTargetDays: 3,
    avgCaloriesDeltaPct: 2,
  },
  weight: { latest: null, avgThisWeek: null, avgPrevWeek: null, weeklyChangeLbs: -0.8 },
  water: { days: [], daysMet: 4, daysLogged: 5, avgLiters: 2.9, targetLiters: 3 },
  sleep: { nights: [], nightsMet: 5, nightsLogged: 7, avgHours: 7.2, targetHours: 7 },
  training: { strengthCount: 4, cardioCount: 3, sessions: [], strengthTarget: 3, cardioTarget: 4 },
};

const SETTINGS: Settings = {
  id: 1,
  accountId: 1,
  targetName: "Fall Cut",
  targetDate: "2026-11-01",
  programType: "weight_loss",
  targetNote: null,
  targetWeightLbs: 175,
  heightInches: 70,
  targetCalories: null,
  targetProteinG: null,
  targetCarbsG: null,
  targetFatG: null,
  timezone: "America/Los_Angeles",
  checkinTemplate: [],
};

function mockCreateResponse(text: string) {
  createMock.mockResolvedValueOnce({ content: [{ type: "text", text }] });
}

test("generateCoachBrief grounds its prompt in the client's name and the real WeekStats numbers", async () => {
  mockCreateResponse("Jake had a solid week overall.");
  const result = await generateCoachBrief(STATS, SETTINGS, "Jake Martinez");

  assert.equal(createMock.mock.calls.length, 1);
  const params = createMock.mock.calls[0][0];
  const payload = JSON.stringify(params);

  assert.ok(payload.includes("Jake Martinez"), "prompt should name the client");
  assert.ok(payload.includes("2143"), "prompt should include the real nutrition average, not invented numbers");
  assert.ok(payload.includes("175"), "prompt should include the real target weight");
  assert.equal(result, "Jake had a solid week overall.");
});

test("generateCoachBrief writes coach-facing, third-person framing into the system prompt", async () => {
  mockCreateResponse("draft");
  await generateCoachBrief(STATS, SETTINGS, "Jake Martinez");

  const params = createMock.mock.calls[0][0];
  const system = Array.isArray(params.system) ? params.system.join("\n") : params.system;
  assert.match(system, /coach/i);
  assert.match(system, /third person/i);
});

test("generateCoachBrief grounds its prompt in recent protocol history when given some", async () => {
  mockCreateResponse("draft");
  await generateCoachBrief(STATS, SETTINGS, "Jake Martinez", [
    { status: "active", effectiveFrom: "2026-08-17", calories: 1800, proteinG: 165, carbsG: 150, fatG: 55 },
    { status: "superseded", effectiveFrom: "2026-07-20", calories: 2000, proteinG: 165, carbsG: 200, fatG: 60 },
  ]);

  const params = createMock.mock.calls[0][0];
  const payload = JSON.stringify(params);
  assert.ok(payload.includes("2026-08-17"), "prompt should include the recent protocol's effective date");
  assert.ok(payload.includes("2026-07-20"), "prompt should include the prior protocol's effective date");
});

test("generateCoachBrief works with no protocol history given (the common case)", async () => {
  mockCreateResponse("draft");
  const result = await generateCoachBrief(STATS, SETTINGS, "Jake Martinez", []);
  assert.equal(result, "draft");
});
