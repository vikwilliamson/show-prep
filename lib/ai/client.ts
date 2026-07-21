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
