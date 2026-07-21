"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Wrong password.");
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <form
        onSubmit={submit}
        className="w-full max-w-xs space-y-3 rounded-xl border border-borderc bg-surface p-6"
      >
        <h1 className="text-lg font-semibold">Show Prep</h1>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border border-borderc bg-background px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
          Enter
        </button>
      </form>
    </div>
  );
}
