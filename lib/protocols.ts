import { and, eq } from "drizzle-orm";
import { getDb, protocols } from "./db";
import type { ExtractionResultT } from "./ai/extract";

// Shared by app/api/documents/route.ts (first-pass extraction on upload) and
// app/api/documents/[id]/reprocess/route.ts (re-running extraction) — kept in
// one place so a field added to the insert (e.g. accountId) can't drift
// between the two call sites.

/** Turns an `extractPrescriptions()` result into `protocols` rows, replacing
 *  any still-pending extractions from a previous run when `replacePending`
 *  is set. Confirmed (active/superseded/rejected) protocols are never
 *  touched. No-ops (returns `[]`) if the extraction found no prescriptions. */
export async function saveExtractedProtocols(
  extraction: ExtractionResultT,
  opts: {
    documentId: number;
    accountId: number;
    today: string;
    replacePending?: boolean;
  },
): Promise<(typeof protocols.$inferSelect)[]> {
  if (!extraction.has_prescription || extraction.prescriptions.length === 0) {
    return [];
  }

  const db = await getDb();
  if (opts.replacePending) {
    await db
      .delete(protocols)
      .where(and(eq(protocols.documentId, opts.documentId), eq(protocols.status, "pending")));
  }
  return db
    .insert(protocols)
    .values(
      extraction.prescriptions.map((p) => ({
        documentId: opts.documentId,
        accountId: opts.accountId,
        status: "pending" as const,
        effectiveFrom: p.effective_date ?? opts.today,
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
