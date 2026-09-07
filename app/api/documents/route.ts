import { NextResponse, type NextRequest } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { requireAccount } from "@/lib/auth";
import { documentChunks, documents, getDb, protocols } from "@/lib/db";
import { extractPrescriptions } from "@/lib/ai/extract";
import { indexDocument } from "@/lib/rag";
import { todayLocal } from "@/lib/dates";
import { getSettings } from "@/lib/stats";
import { saveExtractedProtocols } from "@/lib/protocols";

// Allow long-running Claude/Voyage calls on Vercel (clamped to the plan's max).
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const db = await getDb();
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      category: documents.category,
      sourceType: documents.sourceType,
      originalFilename: documents.originalFilename,
      uploadedAt: documents.uploadedAt,
      embeddedAt: documents.embeddedAt,
      chunkCount: sql<number>`count(${documentChunks.id})`.mapWith(Number),
    })
    .from(documents)
    .leftJoin(documentChunks, eq(documentChunks.documentId, documents.id))
    .where(eq(documents.accountId, session.accountId))
    .groupBy(documents.id)
    .orderBy(desc(documents.uploadedAt));
  return NextResponse.json(rows);
}

const CATEGORIES = new Set(["coach_protocol", "program_rules", "other"]);

async function readUpload(req: NextRequest): Promise<{
  title: string;
  category: "coach_protocol" | "program_rules" | "other";
  sourceType: "pdf" | "txt" | "email_paste";
  originalFilename: string | null;
  contentText: string;
}> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const category = String(form.get("category") ?? "coach_protocol");
    if (!CATEGORIES.has(category)) throw new Error(`Invalid category: ${category}`);
    const file = form.get("file");

    if (file instanceof File) {
      const isPdf =
        file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      let text: string;
      if (isPdf) {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
        const result = await extractText(pdf, { mergePages: true });
        text = result.text;
      } else {
        text = await file.text();
      }
      return {
        title: String(form.get("title") || file.name),
        category: category as "coach_protocol",
        sourceType: isPdf ? "pdf" : "txt",
        originalFilename: file.name,
        contentText: text,
      };
    }

    const pasted = String(form.get("text") ?? "").trim();
    if (!pasted) throw new Error("Provide a file or pasted text.");
    return {
      title: String(form.get("title") || "Pasted note"),
      category: category as "coach_protocol",
      sourceType: "email_paste",
      originalFilename: null,
      contentText: pasted,
    };
  }

  // JSON paste: { title, category, text }
  const body = await req.json();
  const text = String(body.text ?? "").trim();
  if (!text) throw new Error("`text` is required.");
  const category = String(body.category ?? "coach_protocol");
  if (!CATEGORIES.has(category)) throw new Error(`Invalid category: ${category}`);
  return {
    title: String(body.title || "Pasted note"),
    category: category as "coach_protocol",
    sourceType: "email_paste",
    originalFilename: null,
    contentText: text,
  };
}

export async function POST(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  let upload;
  try {
    upload = await readUpload(req);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad upload" },
      { status: 400 },
    );
  }
  if (!upload.contentText.trim()) {
    return NextResponse.json(
      { error: "No text could be extracted from the upload." },
      { status: 422 },
    );
  }

  const db = await getDb();
  const [doc] = await db
    .insert(documents)
    .values({ ...upload, accountId: session.accountId })
    .returning();
  const warnings: string[] = [];
  let createdProtocols: (typeof protocols.$inferSelect)[] = [];

  // Prescription extraction (coach protocols only) — best effort.
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
      });
    } catch (err) {
      warnings.push(
        `Prescription extraction failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Embedding for RAG — best effort.
  try {
    await indexDocument(doc);
  } catch (err) {
    warnings.push(
      `Embedding failed (chat over this doc unavailable): ${err instanceof Error ? err.message : err}`,
    );
  }

  return NextResponse.json(
    { document: doc, protocols: createdProtocols, warnings },
    { status: 201 },
  );
}
