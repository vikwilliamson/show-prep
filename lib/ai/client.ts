import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

// Zero-arg client: resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN /
// an `ant auth login` profile from the environment.
const globalForAi = globalThis as unknown as { __anthropic?: Anthropic };

export function getAnthropic(): Anthropic {
  if (!globalForAi.__anthropic) {
    globalForAi.__anthropic = new Anthropic();
  }
  return globalForAi.__anthropic;
}

export const MODEL = env.anthropicModel;

// Shared across every `messages.create` call site (lib/ai/analysis.ts,
// lib/ai/brief.ts, lib/rag.ts) so the thinking/token budget stays in sync
// instead of being hand-copied per call.
export const AI_MESSAGE_DEFAULTS = {
  max_tokens: 16000,
  thinking: { type: "adaptive" } as const,
};

/** Joins a message's text blocks — the shape every plain-text-generating
 *  call site (as opposed to lib/ai/extract.ts's structured `.parse()`) needs
 *  back from `messages.create`. */
export function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
