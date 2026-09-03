import type { Settings } from "../db/schema";
import type { WeekStats } from "../stats";
import { statsBrief } from "./analysis";
import { getAnthropic, MODEL } from "./client";

// Phase 3's coach-facing weekly brief (specs/phase-3-ai-weekly-coach-brief.md
// §2) — written TO the coach ABOUT one client. Distinct from
// generateWeeklyAnalysis (lib/ai/analysis.ts), which is client-facing,
// self-serve, ungated content; this is coach-internal, reviewed and edited
// before a client ever sees it (see specs/phase-3-ai-weekly-coach-brief.md's
// "Relationship to the existing Weekly Analysis feature").

export interface ProtocolHistoryEntry {
  status: "active" | "superseded";
  effectiveFrom: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

/**
 * Drafts a coach-facing weekly brief for one client: adherence summary,
 * weight trend vs. target, and anything that needs the coach's attention.
 * Grounded in the same WeekStats snapshot generateWeeklyAnalysis uses — it
 * narrates the numbers, never invents them.
 *
 * `recentProtocols` is optional grounding beyond the currently-active
 * protocol `stats.protocol` already carries — recent status changes (e.g.
 * "protocol changed 2 weeks ago") the model otherwise has no data to flag
 * with. Pure function: the caller queries `protocols` and passes the
 * result in, same as it already does for `stats`/`settings` — this stays
 * free of DB access so it's testable against plain fixtures.
 */
export async function generateCoachBrief(
  stats: WeekStats,
  settings: Settings,
  clientName: string,
  recentProtocols: ProtocolHistoryEntry[] = [],
): Promise<string> {
  const client = getAnthropic();
  const historyBlock = recentProtocols.length
    ? `\n\nRecent protocol history (most recent first):\n${JSON.stringify(recentProtocols, null, 2)}`
    : "";
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      "You are writing an internal weekly brief for a coach about one of their clients.",
      `The client's name is ${clientName}. Refer to them by name, third person — this is written to the coach, not to the client.`,
      "Summarize adherence (macros, water, sleep, training) vs. targets, note the weight trend vs. target weight and time remaining, and flag anything that needs the coach's attention (missed logging, an adherence drop, a protocol that may need adjusting).",
      "If recent protocol history is given, use it to explain adherence in context — e.g. a recent protocol change is a plausible reason adherence hasn't caught up yet. Don't speculate about a connection the data doesn't support.",
      "Short paragraphs or a tight bulleted list — this is a working document for the coach to edit, not client-facing copy yet.",
      "Only reference numbers present in the data. Call out missing data (unlogged days) explicitly rather than guessing. No medical claims.",
    ].join("\n"),
    messages: [{ role: "user", content: `Week data:\n${statsBrief(stats, settings)}${historyBlock}` }],
  });
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
