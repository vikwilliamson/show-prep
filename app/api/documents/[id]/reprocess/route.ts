import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { documents, getDb, protocols } from "@/lib/db";
import { extractPrescriptions } from "@/lib/ai/extract";
import { indexDocument } from "@/lib/rag";
import { todayLocal } from "@/lib/dates";
import { getSettings } from "@/lib/stats";

// Re-runs extraction and/or embedding for an existing document — useful after
// configuring API keys, or if the first pass failed.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = await getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, Number(id)));
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const warnings: string[] = [];
  let createdProtocols: (typeof protocols.$inferSelect)[] = [];

  if (doc.category === "coach_protocol") {
    try {
      const settings = await getSettings();
      const extraction = await extractPrescriptions({
        title: doc.title,
        text: doc.contentText,
        uploadedAtLocalDate: todayLocal(settings.timezone),
      });
      if (extraction.has_prescription && extraction.prescriptions.length > 0) {
        // Replace any still-pending extractions from previous runs; confirmed
        // (active/superseded) protocols are never touched.
        await db
          .delete(protocols)
          .where(
            and(eq(protocols.documentId, doc.id), eq(protocols.status, "pending")),
          );
        createdProtocols = await db
          .insert(protocols)
          .values(
            extraction.prescriptions.map((p) => ({
              documentId: doc.id,
              status: "pending" as const,
              effectiveFrom: p.effective_date ?? todayLocal(settings.timezone),
              calories: p.calories != null ? Math.round(p.calories) : null,
              proteinG: p.protein_g != null ? Math.round(p.protein_g) : null,
              carbsG: p.carbs_g != null ? Math.round(p.carbs_g) : null,
              fatG: p.fat_g != null ? Math.round(p.fat_g) : null,
              cardioPlan: p.cardio_plan,
              notes: p.notes,
              extractedJson: { ...p, summary: extraction.summary },
            })),
          )
          .returning();
      }
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
