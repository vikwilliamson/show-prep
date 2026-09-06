import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

// embed() throws immediately if env.voyageApiKey is unset — stub it so the
// timeout behavior can be tested without a real key.
vi.mock("../lib/env", () => ({
  env: {
    voyageApiKey: "test-voyage-key",
    voyageModel: "voyage-4",
  },
}));

const { embed } = await import("../lib/ai/embeddings");

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
});

test("embed() times out a hanging fetch instead of blocking indefinitely", async () => {
  vi.useFakeTimers();

  // Simulates a stalled Voyage response: the fetch never settles on its own,
  // only reacting to the AbortController's signal like a real fetch would.
  global.fetch = vi.fn((_url, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("This operation was aborted", "AbortError"));
      });
    });
  }) as unknown as typeof fetch;

  const promise = embed(["hello"], "document");
  const assertion = assert.rejects(promise, /timed out/i);

  await vi.runAllTimersAsync();
  await assertion;

  assert.ok(
    (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length >= 1,
    "expected at least one fetch attempt before timing out",
  );
});
