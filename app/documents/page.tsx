"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DocRow {
  id: number;
  title: string;
  category: string;
  sourceType: string;
  originalFilename: string | null;
  uploadedAt: string;
  embeddedAt: string | null;
  chunkCount: number;
}

interface ProtocolRow {
  id: number;
  documentId: number | null;
  documentTitle: string | null;
  status: string;
  effectiveFrom: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  cardioPlan: string | null;
  notes: string | null;
  extractedJson: { source_quote?: string | null; confidence?: string; summary?: string } | null;
  confirmedAt: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  coach_protocol: "Coach protocol",
  division_rules: "Division rules",
  other: "Other",
};

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const refresh = useCallback(() => {
    return Promise.all([
      fetch("/api/documents").then((r) => r.json()),
      fetch("/api/protocols").then((r) => r.json()),
    ]).then(([d, p]) => {
      setDocs(d);
      setProtocols(p);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!pasteMode && !(form.get("file") as File | null)?.name) {
      setMessage("Choose a file first.");
      return;
    }
    if (pasteMode) form.delete("file");
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const extracted = json.protocols?.length ?? 0;
      setMessage(
        [
          `Uploaded "${json.document.title}".`,
          extracted
            ? `${extracted} prescription${extracted === 1 ? "" : "s"} extracted — review below.`
            : "No prescriptions detected.",
          ...(json.warnings ?? []),
        ].join(" "),
      );
      formRef.current?.reset();
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function patchProtocol(id: number, action: "confirm" | "reject" | "reactivate") {
    const res = await fetch(`/api/protocols/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage(json.error ?? "Update failed");
    }
    await refresh();
  }

  async function removeDoc(id: number, title: string) {
    if (!confirm(`Delete "${title}" and its chunks?`)) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function reprocess(id: number) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${id}/reprocess`, { method: "POST" });
      const json = await res.json();
      setMessage(
        [json.ok ? "Reprocessed." : "Failed.", ...(json.warnings ?? [])].join(" "),
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const pending = protocols.filter((p) => p.status === "pending");
  const others = protocols.filter((p) => p.status !== "pending");

  return (
    <div className="space-y-6">
      {/* Upload */}
      <section className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Upload a document
        </h2>
        <form ref={formRef} onSubmit={onUpload} className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <input
              name="title"
              placeholder="Title (optional — defaults to filename)"
              className="min-w-64 flex-1 rounded-md border border-borderc bg-background px-3 py-1.5 text-sm"
            />
            <select
              name="category"
              className="rounded-md border border-borderc bg-background px-3 py-1.5 text-sm"
            >
              <option value="coach_protocol">Coach protocol</option>
              <option value="division_rules">Division rules / guidelines</option>
              <option value="other">Other</option>
            </select>
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => setPasteMode(false)}
                className={`rounded-md px-2 py-1 ${!pasteMode ? "bg-accent/15 text-accent" : "text-muted"}`}
              >
                File
              </button>
              <button
                type="button"
                onClick={() => setPasteMode(true)}
                className={`rounded-md px-2 py-1 ${pasteMode ? "bg-accent/15 text-accent" : "text-muted"}`}
              >
                Paste text
              </button>
            </div>
          </div>

          {pasteMode ? (
            <textarea
              name="text"
              rows={6}
              placeholder="Paste the coach's email or notes here…"
              className="w-full rounded-md border border-borderc bg-background px-3 py-2 text-sm"
            />
          ) : (
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept=".pdf,.txt,.md,text/plain,application/pdf"
              className="block text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent/15 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
            />
          )}

          <button
            disabled={busy}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Processing… (extracting prescriptions + embedding)" : "Upload & extract"}
          </button>
          {message && <p className="text-sm text-muted">{message}</p>}
        </form>
      </section>

      {/* Pending protocol review */}
      {pending.length > 0 && (
        <section className="rounded-xl border border-warn/50 bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-warn">
            Extracted prescriptions awaiting your confirmation
          </h2>
          <div className="space-y-3">
            {pending.map((p) => (
              <div key={p.id} className="rounded-lg border border-borderc p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {p.calories != null ? `${p.calories} kcal` : "No calorie target"} ·{" "}
                      {p.proteinG ?? "?"}P / {p.carbsG ?? "?"}C / {p.fatG ?? "?"}F
                    </p>
                    <p className="text-xs text-muted">
                      Effective {p.effectiveFrom}
                      {p.documentTitle && ` · from "${p.documentTitle}"`}
                      {p.extractedJson?.confidence && ` · confidence: ${p.extractedJson.confidence}`}
                    </p>
                    {p.cardioPlan && (
                      <p className="mt-1 text-xs text-muted">Cardio: {p.cardioPlan}</p>
                    )}
                    {p.notes && <p className="mt-1 text-xs text-muted">Notes: {p.notes}</p>}
                    {p.extractedJson?.source_quote && (
                      <p className="mt-1 text-xs italic text-muted">
                        “{p.extractedJson.source_quote}”
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => patchProtocol(p.id, "confirm")}
                      className="rounded-md bg-good px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      Confirm as active
                    </button>
                    <button
                      onClick={() => patchProtocol(p.id, "reject")}
                      className="rounded-md border border-borderc px-3 py-1.5 text-sm hover:bg-borderc/30"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Documents list */}
      <section className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Library ({docs.length})
        </h2>
        {docs.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. Upload your coach&apos;s macro plan, peak-week protocol, or the
            NPC division rules to get started.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Chat-ready</th>
                <th className="py-2 pr-3">Uploaded</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-borderc">
                  <td className="py-2 pr-3 font-medium">{d.title}</td>
                  <td className="py-2 pr-3">{CATEGORY_LABELS[d.category] ?? d.category}</td>
                  <td className="py-2 pr-3 text-muted">{d.sourceType}</td>
                  <td className="py-2 pr-3">
                    {d.chunkCount > 0 ? (
                      <span className="text-good">{d.chunkCount} chunks</span>
                    ) : (
                      <span className="text-muted">not embedded</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-muted">
                    {new Date(d.uploadedAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => reprocess(d.id)}
                      className="mr-2 text-xs text-accent hover:underline"
                    >
                      re-run AI
                    </button>
                    <button
                      onClick={() => removeDoc(d.id, d.title)}
                      className="text-xs text-bad hover:underline"
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Protocol history */}
      {others.length > 0 && (
        <section className="rounded-xl border border-borderc bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Protocol history
          </h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Effective</th>
                <th className="py-2 pr-3">Macros</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {others.map((p) => (
                <tr key={p.id} className="border-t border-borderc">
                  <td className="py-2 pr-3">
                    <span
                      className={
                        p.status === "active"
                          ? "rounded bg-good/15 px-1.5 py-0.5 text-xs font-medium text-good"
                          : "rounded bg-borderc/40 px-1.5 py-0.5 text-xs text-muted"
                      }
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{p.effectiveFrom}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {p.calories ?? "—"} kcal · {p.proteinG ?? "?"}P/{p.carbsG ?? "?"}C/{p.fatG ?? "?"}F
                  </td>
                  <td className="py-2 pr-3 text-muted">{p.documentTitle ?? "—"}</td>
                  <td className="py-2 text-right">
                    {p.status !== "active" && (
                      <button
                        onClick={() => patchProtocol(p.id, "reactivate")}
                        className="text-xs text-accent hover:underline"
                      >
                        make active
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
