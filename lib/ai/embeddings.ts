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
  let res: Response;
  for (let attempt = 1; ; attempt++) {
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
    });
    if (res.status !== 429 || attempt >= MAX_ATTEMPTS) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 22_000 * attempt;
    await new Promise((r) => setTimeout(r, waitMs));
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
