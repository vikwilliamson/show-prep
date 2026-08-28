import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAccount } from "@/lib/auth";
import { documents, getDb } from "@/lib/db";

export async function GET(
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
  return NextResponse.json(doc);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const { id } = await ctx.params;
  const db = await getDb();
  const [deleted] = await db
    .delete(documents)
    .where(and(eq(documents.id, Number(id)), eq(documents.accountId, session.accountId)))
    .returning();
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
