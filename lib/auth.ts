import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { NextResponse, type NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { env } from "./env";
import { accounts, getDb } from "./db";

export const SESSION_COOKIE = "gamma_session";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export type Role = "coach" | "client";

export interface SessionPayload {
  accountId: number;
  role: Role;
}

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days, matches the old cookie's maxAge

function sign(data: string): string {
  if (!env.sessionSecret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return createHmac("sha256", env.sessionSecret).update(data).digest("base64url");
}

export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(passcode, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

// Unambiguous lowercase alphanumeric alphabet — excludes 0/o and 1/l/i so a
// coach can read a passcode aloud or over text without transcription errors.
const PASSCODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Generates a random client passcode, grouped as `xxxx-xxxx` for
 *  readability. Callers must hash it via hashPasscode() before storing —
 *  this only produces the plaintext to hand to the coach once. */
export function generatePasscode(): string {
  const group = () =>
    Array.from(randomBytes(4), (b) => PASSCODE_ALPHABET[b % PASSCODE_ALPHABET.length]).join("");
  return `${group()}-${group()}`;
}

export async function verifyPasscode(passcode: string, hash: string): Promise<boolean> {
  const [salt, storedHex] = hash.split(":");
  if (!salt || !storedHex) return false;
  const stored = Buffer.from(storedHex, "hex");
  const derived = (await scrypt(passcode, salt, KEY_LENGTH)) as Buffer;
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

export function createSessionToken(
  payload: SessionPayload,
  options?: { ttlMs?: number },
): string {
  const exp = Date.now() + (options?.ttlMs ?? DEFAULT_SESSION_TTL_MS);
  const data = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = sign(data);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const { accountId, role, exp } = JSON.parse(Buffer.from(data, "base64url").toString());
    if (typeof exp !== "number" || exp < Date.now()) return null;
    if (typeof accountId !== "number" || (role !== "coach" && role !== "client")) return null;
    return { accountId, role };
  } catch {
    return null;
  }
}

export function getCurrentAccount(cookieValue: string | undefined): SessionPayload | null {
  if (!cookieValue) return null;
  return verifySessionToken(cookieValue);
}

export function requireCoach(cookieValue: string | undefined): NextResponse | null {
  const session = getCurrentAccount(cookieValue);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "coach") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Reads + verifies the session cookie off an API route's request. Route
 *  handlers do `const session = requireAccount(req); if (session instanceof
 *  NextResponse) return session;` to get a typed SessionPayload past that
 *  point. */
export function requireAccount(req: NextRequest): SessionPayload | NextResponse {
  const session = getCurrentAccount(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

/** Resolves an account's opaque referenceId to its internal accountId — the
 *  mobile ingest route's identity mechanism (the shared bearer token proves
 *  "this is a legitimate companion client"; referenceId says whose data it
 *  is). Returns null for an unknown referenceId; callers must reject rather
 *  than fall back to a default account. */
export async function getAccountByReferenceId(referenceId: string): Promise<number | null> {
  const db = await getDb();
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.referenceId, referenceId))
    .limit(1);
  return row?.id ?? null;
}

/** Inverse of getAccountByReferenceId — looks up the referenceId a signed-in
 *  account should paste into the mobile companion app to pair it. Safe to
 *  expose to the account's own authenticated session (Settings page); it's
 *  an opaque UUID, not a secret credential. */
export async function getAccountReferenceId(accountId: number): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ referenceId: accounts.referenceId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  return row?.referenceId ?? null;
}

/** Single-tenant fallback for /api/analysis, the one route not yet migrated
 *  to real account resolution (Phase 3 wires this properly — it's always
 *  called from an already-authenticated dashboard, so there's no
 *  ingest-style auth-mechanism blocker). Resolves to the earliest-created
 *  coach account, mirroring today's de facto behavior where there's exactly
 *  one coach and everything implicitly belongs to them. */
export async function getPrimaryCoachAccountId(): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.role, "coach"))
    .orderBy(asc(accounts.id))
    .limit(1);
  if (!row) {
    throw new Error(
      "No coach account exists yet — run scripts/backfill-accounts.ts first.",
    );
  }
  return row.id;
}

/** Deletes an account and, via ON DELETE CASCADE (VIK-78), every row it
 *  owns across all 14 account-scoped tables in one statement — no more
 *  hand-ordering per-table deletes. Returns whether an account was actually
 *  deleted (false for an unknown accountId). */
export async function deleteAccount(accountId: number): Promise<boolean> {
  const db = await getDb();
  const [deleted] = await db.delete(accounts).where(eq(accounts.id, accountId)).returning();
  return deleted !== undefined;
}
