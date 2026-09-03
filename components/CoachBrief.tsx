"use client";

import { useState } from "react";
import { errorMessage, fetchJson } from "@/lib/client-fetch";
import { localDateOf } from "@/lib/dates";
import { AiBadge } from "@/components/AiBadge";

type BriefRow = {
  status: string;
  content: string;
  approvedAt: string | null;
};

export function CoachBrief({
  accountId,
  weekStart,
  initialBrief,
}: {
  accountId: number;
  weekStart: string;
  initialBrief: BriefRow | null;
}) {
  const [content, setContent] = useState(initialBrief?.content ?? "");
  const [status, setStatus] = useState<string | null>(initialBrief?.status ?? null);
  const [approvedAt, setApprovedAt] = useState<string | null>(initialBrief?.approvedAt ?? null);
  // Tracks whether a draft has ever been generated, independent of the
  // textarea's current (possibly cleared-mid-edit) content — otherwise
  // clearing the textarea to retype would collapse it back to the
  // "No brief yet" placeholder.
  const [hasBrief, setHasBrief] = useState(initialBrief != null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyBrief(brief: BriefRow) {
    setContent(brief.content);
    setStatus(brief.status);
    setApprovedAt(brief.approvedAt);
    setHasBrief(true);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const brief = await fetchJson<BriefRow>(`/api/clients/${accountId}/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      applyBrief(brief);
    } catch (err) {
      setError(errorMessage(err, "Failed to generate."));
    } finally {
      setBusy(false);
    }
  }

  async function save(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const brief = await fetchJson<BriefRow>(`/api/clients/${accountId}/brief`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, content, approve }),
      });
      applyBrief(brief);
    } catch (err) {
      setError(errorMessage(err, approve ? "Failed to approve." : "Failed to save."));
    } finally {
      setBusy(false);
    }
  }

  const isApproved = status === "approved";

  return (
    <div className="space-y-3">
      {hasBrief && <AiBadge detail="Grounded in this week's synced data." />}
      {hasBrief ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          className="w-full rounded-md border border-borderc bg-surface p-2 text-sm leading-relaxed"
        />
      ) : (
        <p className="text-sm text-muted">No brief yet for the week of {weekStart}.</p>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Writing brief…" : hasBrief ? "Regenerate brief" : "Generate brief"}
        </button>
        {hasBrief && (
          <button
            onClick={() => save(false)}
            disabled={busy}
            className="rounded-md border border-borderc px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
          >
            Save
          </button>
        )}
        <button
          onClick={() => save(true)}
          disabled={busy || !hasBrief || isApproved}
          className="rounded-md border border-good px-3 py-1.5 text-sm font-medium text-good hover:bg-good/10 disabled:opacity-50"
        >
          {isApproved && approvedAt ? `Approved ${localDateOf(approvedAt)}` : "Approve"}
        </button>
      </div>
    </div>
  );
}
