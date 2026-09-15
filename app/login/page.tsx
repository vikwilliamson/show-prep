"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function login(value: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: value }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Wrong passcode.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <div className="w-full max-w-xs space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login(password);
          }}
          className="space-y-3 rounded-xl border border-borderc bg-surface p-6"
        >
          <h1 className="text-lg font-semibold">Gamma</h1>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passcode"
            aria-label="Passcode"
            className="w-full rounded-md border border-borderc bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
