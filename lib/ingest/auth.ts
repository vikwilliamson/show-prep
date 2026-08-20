import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "../env";

/**
 * Bearer-token gate for /api/ingest/*. When INGEST_API_KEY is unset (local
 * dev), ingestion is open — the app is single-user and typically not exposed.
 */
export function checkIngestAuth(req: NextRequest): NextResponse | null {
  if (!env.ingestApiKey) return null;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const a = Buffer.from(token ?? "");
  const b = Buffer.from(env.ingestApiKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
