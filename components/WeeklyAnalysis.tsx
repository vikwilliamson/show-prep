"use client";

import { useState } from "react";
import { errorMessage, fetchJson } from "@/lib/client-fetch";
import { AiBadge } from "@/components/AiBadge";

export function WeeklyAnalysis({
  weekStart,
  initialAnalysis,
}: {
  weekStart: string;
  initialAnalysis: string | null;
}) {
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const json = await fetchJson<{ analysis: string }>("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      setAnalysis(json.analysis);
    } catch (err) {
      setError(errorMessage(err, "Failed to generate."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {analysis ? (
        <>
          <AiBadge detail="Grounded in this week's synced macro, weight, water, and sleep data." />
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{analysis}</div>
        </>
      ) : (
        <p className="text-sm text-muted">
          No analysis yet for the week of {weekStart}.
        </p>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <button
        onClick={generate}
        disabled={busy}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Writing analysis…" : analysis ? "Regenerate analysis" : "Generate analysis"}
      </button>
    </div>
  );
}
