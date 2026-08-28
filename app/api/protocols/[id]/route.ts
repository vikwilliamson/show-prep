import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { getDb, protocols } from "@/lib/db";

const patchSchema = z.object({
  action: z.enum(["confirm", "reject", "reactivate"]),
  // Optional user edits applied at confirmation time (the "user confirms
  // before it becomes active" step allows correcting extraction mistakes).
  effectiveFrom: z.iso.date().optional(),
  calories: z.number().int().positive().nullable().optional(),
  proteinG: z.number().int().nonnegative().nullable().optional(),
  carbsG: z.number().int().nonnegative().nullable().optional(),
  fatG: z.number().int().nonnegative().nullable().optional(),
  cardioPlan: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }
  const { action, ...edits } = parsed.data;
  const db = await getDb();
  const protocolId = Number(id);

  const [existing] = await db
    .select()
    .from(protocols)
    .where(and(eq(protocols.id, protocolId), eq(protocols.accountId, session.accountId)));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "reject") {
    const [updated] = await db
      .update(protocols)
      .set({ status: "rejected" })
      .where(and(eq(protocols.id, protocolId), eq(protocols.accountId, session.accountId)))
      .returning();
    return NextResponse.json(updated);
  }

  // confirm / reactivate: this protocol becomes the single active one for
  // the caller's account — scoped so it doesn't supersede other accounts'
  // active protocols.
  await db
    .update(protocols)
    .set({ status: "superseded" })
    .where(
      and(
        eq(protocols.accountId, session.accountId),
        eq(protocols.status, "active"),
        ne(protocols.id, protocolId),
      ),
    );

  const [updated] = await db
    .update(protocols)
    .set({ ...edits, status: "active", confirmedAt: new Date() })
    .where(and(eq(protocols.id, protocolId), eq(protocols.accountId, session.accountId)))
    .returning();
  return NextResponse.json(updated);
}
