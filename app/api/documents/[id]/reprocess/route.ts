import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAccount } from "@/lib/auth";
import { documents, getDb, protocols } from "@/lib/db";
import { extractPrescriptions } from "@/lib/ai/extract";
import { indexDocument } from "@/lib/rag";
import { todayLocal } from "@/lib/dates";
import { getSettings } from "@/lib/stats";
import { saveExtractedProtocols } from "@/lib/protocols";

// Allow long-running Claude/Voyage calls on Vercel (clamped to the plan's max).
export const maxDuration = 300;

// Re-runs extraction and/or embedding for an existing document — useful after
// configuring API keys, or if the first pass failed.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const { id } = await ctx.params;
  const db = await getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, Number(id)), eq(documents.accountId, session.accountId)));
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const warnings: string[] = [];
  let createdProtocols: (typeof protocols.$inferSelect)[] = [];

  if (doc.category === "coach_protocol") {
    try {
      const settings = await getSettings(session.accountId);
      const extraction = await extractPrescriptions({
        title: doc.title,
        text: doc.contentText,
        uploadedAtLocalDate: todayLocal(settings.timezone),
      });
      createdProtocols = await saveExtractedProtocols(extraction, {
        documentId: doc.id,
        accountId: session.accountId,
        today: todayLocal(settings.timezone),
        replacePending: true,
      });
    } catch (err) {
      warnings.push(
        `Extraction failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  try {
    await indexDocument(doc);
  } catch (err) {
    warnings.push(
      `Embedding failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  return NextResponse.json({ ok: true, protocols: createdProtocols, warnings });
}
