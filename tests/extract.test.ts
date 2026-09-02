import assert from "node:assert/strict";
import { test, vi } from "vitest";

// extractPrescriptions() calls client.messages.parse(), which (in the real
// SDK) runs the response text through output_config.format.parse — the same
// zod-backed parser exercised here — before handing back parsed_output.
// Mocking at this seam lets each test drive our actual ExtractedPrescription
// validation/coercion logic with a fabricated "extraction response," without
// a real Anthropic call.
const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

vi.mock("../lib/ai/client", () => ({
  getAnthropic: () => ({ messages: { parse: parseMock } }),
  MODEL: "test-model",
}));

const { extractPrescriptions } = await import("../lib/ai/extract");

type ParseParams = { output_config: { format: { parse: (content: string) => unknown } } };

/** Queues one fake model response with a single prescription entry. */
function mockPrescriptionResponse(effectiveDate: string | null) {
  parseMock.mockImplementationOnce(async (params: ParseParams) => {
    const raw = JSON.stringify({
      has_prescription: true,
      summary: "test summary",
      prescriptions: [
        {
          effective_date: effectiveDate,
          calories: 2000,
          protein_g: 180,
          carbs_g: 200,
          fat_g: 60,
          cardio_plan: null,
          notes: null,
          source_quote: null,
          confidence: "high",
        },
      ],
    });
    return { parsed_output: params.output_config.format.parse(raw) };
  });
}

test("a malformed effective_date from the model is coerced to null, not passed through", async () => {
  mockPrescriptionResponse("not-a-date");
  const result = await extractPrescriptions({
    title: "Test doc",
    text: "irrelevant",
    uploadedAtLocalDate: "2026-08-18",
  });
  assert.equal(result.prescriptions[0].effective_date, null);
});

test("a nonexistent calendar date (Feb 30) is coerced to null", async () => {
  mockPrescriptionResponse("2026-02-30");
  const result = await extractPrescriptions({
    title: "Test doc",
    text: "irrelevant",
    uploadedAtLocalDate: "2026-08-18",
  });
  assert.equal(result.prescriptions[0].effective_date, null);
});

test("a two-digit year is coerced to null", async () => {
  mockPrescriptionResponse("26-08-18");
  const result = await extractPrescriptions({
    title: "Test doc",
    text: "irrelevant",
    uploadedAtLocalDate: "2026-08-18",
  });
  assert.equal(result.prescriptions[0].effective_date, null);
});

test("a valid ISO date passes through unchanged", async () => {
  mockPrescriptionResponse("2026-09-01");
  const result = await extractPrescriptions({
    title: "Test doc",
    text: "irrelevant",
    uploadedAtLocalDate: "2026-08-18",
  });
  assert.equal(result.prescriptions[0].effective_date, "2026-09-01");
});

test("null effective_date passes through as null", async () => {
  mockPrescriptionResponse(null);
  const result = await extractPrescriptions({
    title: "Test doc",
    text: "irrelevant",
    uploadedAtLocalDate: "2026-08-18",
  });
  assert.equal(result.prescriptions[0].effective_date, null);
});
