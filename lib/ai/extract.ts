import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, MODEL } from "./client";

// Extraction of structured prescriptions from coach documents. The result is
// stored as a *pending* protocol that the user confirms before it becomes
// the active protocol.

export const ExtractedPrescription = z.object({
  effective_date: z
    .string()
    .nullable()
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
      "Other actionable instructions: refeeds, peak week steps, water/sodium manipulation, supplements, posing.",
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
      "One entry per distinct prescription phase (e.g. 'weeks 1-4' and 'peak week' are separate entries). Empty if none.",
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
      "You extract structured nutrition/cardio prescriptions from bodybuilding-coach documents (emails, PDFs, check-in replies).",
      "Rules:",
      "- Only report numbers actually present in the document; never invent targets.",
      "- If macros are given per-meal, sum them into daily totals and say so in notes.",
      `- Resolve relative dates ('starting Monday', 'next week') against the upload date ${input.uploadedAtLocalDate}.`,
      "- Peak-week or multi-phase plans become separate prescription entries.",
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
