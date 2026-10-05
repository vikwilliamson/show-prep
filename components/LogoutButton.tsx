"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export function LogoutButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (pathname === "/login") return null;

  async function logout() {
    setError(false);
    setBusy(true);
    try {
      const res = await fetch("/api/session", { method: "DELETE" });
      if (!res.ok) throw new Error("logout failed");
      router.push("/login");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-bad">
          Couldn&apos;t log out. Try again.
        </span>
      )}
      <button
        onClick={logout}
        disabled={busy}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-borderc/40 hover:text-foreground disabled:opacity-50"
      >
        Log out
      </button>
    </div>
  );
}
