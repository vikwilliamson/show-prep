import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireAccount, resolveWorkspaceAccountId } from "@/lib/auth";
import { documents, getDb, protocols } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const accountIdParam = req.nextUrl.searchParams.get("accountId");
  const resolved = await resolveWorkspaceAccountId(
    session,
    accountIdParam != null ? Number(accountIdParam) : null,
  );
  if (resolved instanceof NextResponse) return resolved;

  const status = req.nextUrl.searchParams.get("status");
  const db = await getDb();
  const rows = await db
    .select({
      protocol: protocols,
      documentTitle: documents.title,
    })
    .from(protocols)
    .leftJoin(documents, eq(documents.id, protocols.documentId))
    .where(
      and(
        eq(protocols.accountId, resolved),
        status ? eq(protocols.status, status as "pending") : undefined,
      ),
    )
    .orderBy(desc(protocols.createdAt));
  return NextResponse.json(
    rows.map((r) => ({ ...r.protocol, documentTitle: r.documentTitle })),
  );
}
