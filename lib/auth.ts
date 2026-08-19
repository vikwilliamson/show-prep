import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { env } from "./env";

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
