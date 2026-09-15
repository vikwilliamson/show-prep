import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { deleteAccount, getClientAccount, requireCoach, SESSION_COOKIE } from "@/lib/auth";
import { accounts, getDb } from "@/lib/db";

// PATCH { name?, email? } — coach-only, getClientAccount 404-on-non-client
// scoping. Intentionally excludes passcode/role: passcode rotation is
// already flagged as unbuilt/out-of-scope in
// specs/mobile-companion-onboarding.md, so it isn't folded in here.
const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email()).nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: "Provide at least one of name or email.",
  });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ accountId: string }> }) {
  const authError = requireCoach(req.cookies.get(SESSION_COOKIE)?.value);
  if (authError) return authError;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  const { accountId } = await ctx.params;
  const client = await getClientAccount(Number(accountId));
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: { name?: string; email?: string | null } = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.email !== undefined) updates.email = parsed.data.email;

  const db = await getDb();
  const [row] = await db.update(accounts).set(updates).where(eq(accounts.id, client.id)).returning();

  return NextResponse.json({
    account: {
      id: row.id,
      referenceId: row.referenceId,
      name: row.name,
      email: row.email,
      role: row.role,
      timezone: row.timezone,
      createdAt: row.createdAt,
    },
  });
}

// DELETE — coach-only, same scoping, calls the existing deleteAccount()
// (cascades via VIK-78's ON DELETE CASCADE across every account-scoped
// table). No body — the destructive confirmation step lives in the UI, not
// this route.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ accountId: string }> }) {
  const authError = requireCoach(req.cookies.get(SESSION_COOKIE)?.value);
  if (authError) return authError;

  const { accountId } = await ctx.params;
  const client = await getClientAccount(Number(accountId));
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteAccount(client.id);
  return NextResponse.json({ ok: true });
}
