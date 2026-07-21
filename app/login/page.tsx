"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// When NEXT_PUBLIC_DEMO_PASSWORD is set, the login screen advertises the demo
// credential and offers a one-click entry — for portfolio/reviewer access.
// Set it equal to APP_PASSWORD in the deployment environment.
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD;

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
        body: JSON.stringify({ password: value }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Wrong password.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <div className="w-full max-w-xs space-y-4">
        {DEMO_PASSWORD && (
          <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
            <p className="font-medium text-accent">Portfolio demo</p>
            <p className="mt-1 text-muted">
              This is a live demo seeded with sample contest-prep data. Click
              below to explore the dashboard, check-in generator, document chat,
              and weight-cap calculator.
            </p>
            <button
              onClick={() => login(DEMO_PASSWORD)}
              disabled={busy}
              className="mt-3 w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Entering…" : "Enter demo →"}
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            login(password);
          }}
          className="space-y-3 rounded-xl border border-borderc bg-surface p-6"
        >
          <h1 className="text-lg font-semibold">Show Prep</h1>
          <input
            type="password"
            autoFocus={!DEMO_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
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
