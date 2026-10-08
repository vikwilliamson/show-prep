"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

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
        // Stay busy: the form must not be re-submittable during the redirect.
        setSuccess(true);
        // Hard navigation, not router.push: the nav links on this page
        // prefetch "/", and the proxy answers that logged-out prefetch with a
        // redirect to /login, which the client router cache then replays.
        setTimeout(() => window.location.assign("/"), 400);
        return;
      }
      setError("Wrong passcode.");
    } catch {
      setError("Couldn't reach the server. Try again.");
    }
    setBusy(false);
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
          {success && (
            <p role="status" className="text-sm text-good">
              Login successful.
            </p>
          )}
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
