import assert from "node:assert/strict";
import { test } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { AI_MESSAGE_DEFAULTS, extractText } from "../lib/ai/client";

function messageWith(content: Anthropic.Message["content"]): Anthropic.Message {
  return { content } as Anthropic.Message;
}

test("extractText joins text blocks with newlines", () => {
  const response = messageWith([
    { type: "text", text: "First paragraph." } as Anthropic.TextBlock,
    { type: "text", text: "Second paragraph." } as Anthropic.TextBlock,
  ]);
  assert.equal(extractText(response), "First paragraph.\nSecond paragraph.");
});

test("extractText skips non-text blocks (e.g. thinking blocks)", () => {
  const response = messageWith([
    { type: "thinking", thinking: "reasoning the caller shouldn't see" } as Anthropic.ContentBlock,
    { type: "text", text: "Only this is user-facing." } as Anthropic.TextBlock,
  ]);
  assert.equal(extractText(response), "Only this is user-facing.");
});

test("extractText returns an empty string when there are no text blocks", () => {
  assert.equal(extractText(messageWith([])), "");
});

test("AI_MESSAGE_DEFAULTS carries the shared token budget and thinking config", () => {
  assert.equal(AI_MESSAGE_DEFAULTS.max_tokens, 16000);
  assert.deepEqual(AI_MESSAGE_DEFAULTS.thinking, { type: "adaptive" });
});
