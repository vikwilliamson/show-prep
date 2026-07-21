import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { documents, getDb, protocols } from "@/lib/db";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const db = await getDb();
  const rows = await db
    .select({
      protocol: protocols,
      documentTitle: documents.title,
    })
    .from(protocols)
    .leftJoin(documents, eq(documents.id, protocols.documentId))
    .where(status ? eq(protocols.status, status as "pending") : undefined)
    .orderBy(desc(protocols.createdAt));
  return NextResponse.json(
    rows.map((r) => ({ ...r.protocol, documentTitle: r.documentTitle })),
  );
}
