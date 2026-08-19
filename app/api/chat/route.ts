import { NextResponse, type NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { chatMessages, getDb } from "@/lib/db";
import { answerQuestion } from "@/lib/rag";

// Allow long-running Claude/Voyage calls on Vercel (clamped to the plan's max).
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const db = await getDb();
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.accountId, session.accountId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
  return NextResponse.json(rows);
}

const postSchema = z.object({ message: z.string().min(1).max(4000) });

export async function POST(req: NextRequest) {
  const session = requireAccount(req);
  if (session instanceof NextResponse) return session;

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "message required" }, { status: 422 });
  }
  const db = await getDb();

  const history = (
    await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.accountId, session.accountId))
      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
  ).map((m) => ({ role: m.role, content: m.content }));

  const [userMsg] = await db
    .insert(chatMessages)
    .values({ accountId: session.accountId, role: "user", content: parsed.data.message })
    .returning();

  try {
    const { answer, sources } = await answerQuestion(
      session.accountId,
      parsed.data.message,
      history,
    );
    const [assistantMsg] = await db
      .insert(chatMessages)
      .values({ accountId: session.accountId, role: "assistant", content: answer, sources })
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

  const db = await getDb();
  await db.delete(chatMessages).where(eq(chatMessages.accountId, session.accountId));
  return NextResponse.json({ ok: true });
}
