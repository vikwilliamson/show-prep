import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generatePasscode, hashPasscode, requireCoach, SESSION_COOKIE } from "@/lib/auth";
import { accounts, getDb } from "@/lib/db";

// POST { name } — coach-only. Creates a new client account with a
// server-generated passcode (never coach-chosen, per specs/phase-1-followups.md
// §B) and returns it in plaintext exactly once; it's never re-derivable from
// the stored hash after this response.
const postSchema = z.object({ name: z.string().trim().min(1) });

export async function POST(req: NextRequest) {
  const authError = requireCoach(req.cookies.get(SESSION_COOKIE)?.value);
  if (authError) return authError;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(parsed.error) },
      { status: 422 },
    );
  }

  const passcode = generatePasscode();
  const passcodeHash = await hashPasscode(passcode);
  const db = await getDb();
  const [row] = await db
    .insert(accounts)
    .values({ name: parsed.data.name, role: "client", passcodeHash })
    .returning();
  const account = {
    id: row.id,
    referenceId: row.referenceId,
    name: row.name,
    email: row.email,
    role: row.role,
    timezone: row.timezone,
    createdAt: row.createdAt,
  };

  return NextResponse.json({ account, passcode }, { status: 201 });
}
