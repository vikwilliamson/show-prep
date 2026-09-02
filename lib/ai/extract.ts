import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, MODEL } from "./client";

// Extraction of structured prescriptions from coach documents. The result is
// stored as a *pending* protocol that the user confirms before it becomes
// the active protocol.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True if `s` is `YYYY-MM-DD` and denotes a real calendar date. */
function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const ExtractedPrescription = z.object({
  // The model is only prompt-guided toward YYYY-MM-DD, not schema-enforced —
  // a hallucinated/non-ISO/impossible date (two-digit year, "TBD", Feb 30)
  // must not reach `protocols.effective_from` (NOT NULL date column). The
  // refine enforces the real shape; `.catch(null)` coerces a failure to null
  // instead of failing the whole structured-output parse, so both call
  // sites' existing `p.effective_date ?? todayLocal(...)` fallback handles
  // it in place of an opaque Postgres insert error. (`.transform()` can't be
  // used here — zod v4 can't represent it in the JSON schema sent to the
  // model.)
  effective_date: z
    .string()
    .refine(isValidIsoDate, { message: "must be a real YYYY-MM-DD date" })
    .nullable()
    .catch(null)
    .describe(
      "YYYY-MM-DD date this prescription takes effect, if stated or inferable (e.g. 'starting Monday'). Null if unknown.",
    ),
  calories: z.number().nullable().describe("Daily calorie target."),
  protein_g: z.number().nullable().describe("Daily protein grams."),
  carbs_g: z.number().nullable().describe("Daily carbohydrate grams."),
  fat_g: z.number().nullable().describe("Daily fat grams."),
  cardio_plan: z
    .string()
    .nullable()
    .describe(
      "Cardio prescription in the coach's words (sessions/week, duration, modality, steps).",
    ),
  notes: z
    .string()
    .nullable()
    .describe(
      "Other actionable instructions: refeeds, final-phase adjustments, water/sodium manipulation, supplements.",
    ),
  source_quote: z
    .string()
    .nullable()
    .describe("Short verbatim quote from the document supporting the numbers."),
  confidence: z.enum(["high", "medium", "low"]),
});

export const ExtractionResult = z.object({
  has_prescription: z
    .boolean()
    .describe("True if the document contains at least one macro/cardio prescription."),
  summary: z.string().describe("1-2 sentence plain-language summary of the document."),
  prescriptions: z
    .array(ExtractedPrescription)
    .describe(
      "One entry per distinct prescription phase (e.g. 'weeks 1-4' and 'final phase' are separate entries). Empty if none.",
    ),
});

export type ExtractionResultT = z.infer<typeof ExtractionResult>;

export async function extractPrescriptions(input: {
  title: string;
  text: string;
  uploadedAtLocalDate: string;
}): Promise<ExtractionResultT> {
  const client = getAnthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      "You extract structured nutrition/cardio prescriptions from coach documents (emails, PDFs, check-in replies).",
      "Rules:",
      "- Only report numbers actually present in the document; never invent targets.",
      "- If macros are given per-meal, sum them into daily totals and say so in notes.",
      `- Resolve relative dates ('starting Monday', 'next week') against the upload date ${input.uploadedAtLocalDate}.`,
      "- Multi-phase plans become separate prescription entries.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `Document title: ${input.title}\n\n---\n${input.text}`,
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionResult) },
  });

  if (!response.parsed_output) {
    throw new Error("Extraction returned no parseable output.");
  }
  return response.parsed_output;
}
