// Testable core of `pnpm fix:vercel-db-scoping` (scripts/fix-vercel-db-scoping.ts
// is the thin CLI wrapper supplying the real neonctl/vercel calls below).
//
// The Neon<->Vercel marketplace integration is connected to this project
// scoped to Preview only (see VIK-83) — Production and Development each get
// their DATABASE_URL set directly via `vercel env add`, not through the
// integration. Any future disconnect/reconnect of that integration, or a
// stray `vercel env rm`, can wipe those two manual values. This gives a
// single command to restore them rather than another multi-step fire drill.

export interface EnvSetter {
  /** Sets NAME for the given Vercel environment (overwriting any existing value). */
  set(name: string, environment: "production" | "development", value: string): void;
}

export interface ConnectionStrings {
  getProduction: () => string;
  getTest: () => string;
}

export function reapplyDbScoping(conn: ConnectionStrings, setter: EnvSetter): void {
  setter.set("DATABASE_URL", "production", conn.getProduction());
  setter.set("DATABASE_URL", "development", conn.getTest());
}
