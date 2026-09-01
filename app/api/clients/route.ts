import { NextResponse, type NextRequest } from "next/server";
import { listClientAccounts, requireCoach, SESSION_COOKIE } from "@/lib/auth";

// GET — coach-only. Lists every client account for the coach dashboard's
// client list (id, name, createdAt).
export async function GET(req: NextRequest) {
  const authError = requireCoach(req.cookies.get(SESSION_COOKIE)?.value);
  if (authError) return authError;

  const clients = await listClientAccounts();
  return NextResponse.json(clients);
}
