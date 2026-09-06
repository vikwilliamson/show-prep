import { env } from "../env";
import { EMBEDDING_DIM } from "../db/schema";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

/**
 * Embeds texts with Voyage AI (voyage-4), 1024 dims to match the
 * document_chunks.embedding column. `inputType` improves retrieval quality:
 * "document" when indexing, "query" when searching.
 */
export async function embed(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  if (!env.voyageApiKey) {
    throw new Error(
      "VOYAGE_API_KEY is not set — embeddings (document chat) are unavailable.",
    );
  }
  if (texts.length === 0) return [];

  // Free-tier Voyage accounts are limited to 3 requests/minute, so retry
  // 429s with a backoff instead of failing the upload.
  const MAX_ATTEMPTS = 4;
  // Per-attempt timeout, well under the route's maxDuration=300s — a hang
  // (as opposed to a fast 429) is treated as retryable too, so it can't
  // silently consume the whole request budget.
  const REQUEST_TIMEOUT_MS = 20_000;
  let res: Response | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      res = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.voyageApiKey}`,
        },
        body: JSON.stringify({
          model: env.voyageModel,
          input: texts,
          input_type: inputType,
          output_dimension: EMBEDDING_DIM,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (!(err instanceof Error) || err.name !== "AbortError") throw err;
      res = undefined;
    } finally {
      clearTimeout(timeout);
    }

    const retryable = res === undefined || res.status === 429;
    if (!retryable || attempt >= MAX_ATTEMPTS) break;

    const retryAfter = res ? Number(res.headers.get("retry-after")) : NaN;
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 22_000 * attempt;
    await new Promise((r) => setTimeout(r, waitMs));
  }

  if (!res) {
    throw new Error(
      `Voyage embeddings timed out after ${MAX_ATTEMPTS} attempts (${REQUEST_TIMEOUT_MS}ms each)`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voyage embeddings failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    data: { index: number; embedding: number[] }[];
  };
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
