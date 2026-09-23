import { NextResponse, type NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAccount, resolveWorkspaceAccountId } from "@/lib/auth";
import { accounts, chatMessages, getDb } from "@/lib/db";
import { answerQuestion } from "@/lib/rag";

// Allow long-running Claude/Voyage calls on Vercel (clamped to the plan's max).
export const maxDuration = 300;

function accountIdParam(req: NextRequest): number | null {
  const raw = req.nextUrl.searchParams.get("accountId");
  return raw != null ? Number(raw) : null;
}

export async function GET(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const resolved = await resolveWorkspaceAccountId(session, accountIdParam(req));
  if (resolved instanceof NextResponse) return resolved;

  const db = await getDb();
  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      sources: chatMessages.sources,
      createdAt: chatMessages.createdAt,
      senderAccountId: chatMessages.senderAccountId,
      senderName: accounts.name,
      isOwnMessage: eq(chatMessages.senderAccountId, session.accountId),
    })
    .from(chatMessages)
    .leftJoin(accounts, eq(accounts.id, chatMessages.senderAccountId))
    .where(eq(chatMessages.accountId, resolved))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
  return NextResponse.json(rows);
}

const postSchema = z.object({
  message: z.string().min(1).max(4000),
  accountId: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "message required" }, { status: 422 });
  }
  const resolved = await resolveWorkspaceAccountId(session, parsed.data.accountId ?? null);
  if (resolved instanceof NextResponse) return resolved;

  const db = await getDb();

  const history = (
    await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.accountId, resolved))
      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
  ).map((m) => ({ role: m.role, content: m.content }));

  const [userMsg] = await db
    .insert(chatMessages)
    .values({
      accountId: resolved,
      senderAccountId: session.accountId,
      role: "user",
      content: parsed.data.message,
    })
    .returning();

  try {
    const { answer, sources } = await answerQuestion(resolved, parsed.data.message, history);
    const [assistantMsg] = await db
      .insert(chatMessages)
      .values({
        accountId: resolved,
        // The bot has no account — set to the thread's own accountId, per
        // specs/coach-client-scoped-workspace.md §2. The UI never reads
        // senderAccountId for role: "assistant" rows anyway.
        senderAccountId: resolved,
        role: "assistant",
        content: answer,
        sources,
      })
      .returning();
    return NextResponse.json({ user: userMsg, assistant: assistantMsg });
  } catch (err) {
    // Keep the user message but surface the failure.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed", user: userMsg },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const resolved = await resolveWorkspaceAccountId(session, accountIdParam(req));
  if (resolved instanceof NextResponse) return resolved;

  const db = await getDb();
  await db.delete(chatMessages).where(eq(chatMessages.accountId, resolved));
  return NextResponse.json({ ok: true });
}
