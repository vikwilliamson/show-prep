import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { documentChunks, documents, getDb, type Document } from "./db";
import { embed } from "./ai/embeddings";
import { getAnthropic, MODEL } from "./ai/client";
import { getActiveProtocol, getSettings } from "./stats";

// -- Chunking ---------------------------------------------------------------

const TARGET_CHUNK_CHARS = 1200;
const OVERLAP_CHARS = 150;

/** Paragraph-preserving chunker: packs paragraphs up to ~1200 chars with a
 *  short tail overlap so prescriptions split across boundaries stay findable. */
export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    // Hard-split any single paragraph longer than the target.
    const pieces =
      p.length > TARGET_CHUNK_CHARS
        ? (p.match(new RegExp(`[\\s\\S]{1,${TARGET_CHUNK_CHARS}}`, "g")) ?? [])
        : [p];
    for (const piece of pieces) {
      if (current && current.length + piece.length + 2 > TARGET_CHUNK_CHARS) {
        chunks.push(current);
        current = current.slice(-OVERLAP_CHARS) + "\n\n";
      }
      current += (current.endsWith("\n\n") || !current ? "" : "\n\n") + piece;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

// -- Indexing ---------------------------------------------------------------

/** Chunks + embeds a document and stores its vectors. Idempotent per doc. */
export async function indexDocument(doc: Document): Promise<number> {
  const db = await getDb();
  const chunks = chunkText(doc.contentText);
  if (chunks.length === 0) return 0;

  const vectors = await embed(chunks, "document");
  await db.transaction(async (tx) => {
    await tx.delete(documentChunks).where(eq(documentChunks.documentId, doc.id));
    await tx.insert(documentChunks).values(
      chunks.map((content, i) => ({
        documentId: doc.id,
        accountId: doc.accountId,
        chunkIndex: i,
        content,
        embedding: vectors[i],
      })),
    );
    await tx
      .update(documents)
      .set({ embeddedAt: new Date() })
      .where(eq(documents.id, doc.id));
  });
  return chunks.length;
}

// -- Retrieval + chat ---------------------------------------------------------

export interface RetrievedChunk {
  documentId: number;
  documentTitle: string;
  category: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

export async function retrieve(
  accountId: number,
  query: string,
  k = 6,
): Promise<RetrievedChunk[]> {
  const db = await getDb();
  const [queryVec] = await embed([query], "query");
  const similarity = sql<number>`1 - (${cosineDistance(
    documentChunks.embedding,
    queryVec,
  )})`;

  return db
    .select({
      documentId: documentChunks.documentId,
      documentTitle: documents.title,
      category: documents.category,
      chunkIndex: documentChunks.chunkIndex,
      content: documentChunks.content,
      similarity,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .where(and(eq(documentChunks.accountId, accountId), gt(similarity, 0.3)))
    .orderBy((t) => desc(t.similarity))
    .limit(k);
}

export interface ChatAnswer {
  answer: string;
  sources: { documentId: number; title: string; chunkIndex: number }[];
}

const CHAT_SYSTEM = `You answer a coaching client's questions about their own uploaded documents: coach protocols (macros, cardio, training) and program rules/guidelines.

Rules:
- Ground every answer in the provided document excerpts; cite which document a fact came from by title.
- If the excerpts don't contain the answer, say so plainly rather than guessing.
- You are not the coach: describe what the documents say, don't invent new prescriptions or medical advice.
- Be concise and concrete; use the client's coach's numbers verbatim when quoting targets.
- Use "Right now" below for anything relative to today/this week (e.g. "how many carbs can I eat today") — weigh it against any day-specific schedule in the excerpts (e.g. a final-phase's Mon-Wed vs Thu-Fri splits) rather than just quoting the flat weekly target.`;

/** "Right now" block: current date/time + the active protocol snapshot, so
 *  the model can answer day-relative questions without re-deriving "today"
 *  or guessing at numbers RAG retrieval might not surface. */
async function nowContext(accountId: number): Promise<string> {
  const [settings, protocol] = await Promise.all([
    getSettings(accountId),
    getActiveProtocol(accountId),
  ]);
  const now = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());

  const protocolLine = protocol
    ? `Active protocol (flat weekly target, effective since ${protocol.effectiveFrom}): ${protocol.calories ?? "?"} kcal, ${protocol.proteinG ?? "?"}P/${protocol.carbsG ?? "?"}C/${protocol.fatG ?? "?"}F.` +
      (protocol.cardioPlan ? ` Cardio: ${protocol.cardioPlan}.` : "")
    : "No active (confirmed) protocol is set.";

  return `Right now: ${now}.\n${protocolLine}`;
}

export async function answerQuestion(
  accountId: number,
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<ChatAnswer> {
  const [chunks, now] = await Promise.all([
    retrieve(accountId, question),
    nowContext(accountId),
  ]);
  const context = chunks.length
    ? chunks
        .map(
          (c, i) =>
            `[${i + 1}] From "${c.documentTitle}" (${c.category}):\n${c.content}`,
        )
        .join("\n\n---\n\n")
    : "(no relevant excerpts found)";

  const client = getAnthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: `${CHAT_SYSTEM}\n\n${now}`,
    messages: [
      ...history.slice(-8),
      {
        role: "user" as const,
        content: `Document excerpts:\n\n${context}\n\n---\n\nQuestion: ${question}`,
      },
    ],
  });

  const answer = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // De-duplicate sources by document.
  const seen = new Set<number>();
  const sources = chunks
    .filter((c) => (seen.has(c.documentId) ? false : (seen.add(c.documentId), true)))
    .map((c) => ({
      documentId: c.documentId,
      title: c.documentTitle,
      chunkIndex: c.chunkIndex,
    }));

  return { answer, sources };
}
