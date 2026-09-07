"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, fetchJson } from "@/lib/client-fetch";
import { addDays } from "@/lib/dates";
import { FormField } from "@/components/FormField";

interface CheckinData {
  weekStart: string;
  checkIn: {
    waistIn: number | null;
    strengthTrend: string | null;
    digestion: string | null;
    changeRequests: string | null;
    manualNotes: string | null;
    generatedDraft: string | null;
    sentAt: string | null;
  } | null;
  dataAnswers: Record<string, string>;
  template: { key: string; question: string; type: "data" | "manual" | "mixed" }[];
}

const DATA_ANSWER_KEYS: Record<string, string> = {
  macro_adherence: "macro_adherence",
  bodyweight_waist: "bodyweight",
  water: "water",
  sleep: "sleep",
  workouts_cardio: "workouts_cardio",
  next_target: "next_target",
};

export default function CheckInPage() {
  const [data, setData] = useState<CheckinData | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({
    waistIn: "",
    strengthTrend: "",
    digestion: "",
    changeRequests: "",
    manualNotes: "",
  });
  const [draft, setDraft] = useState<string>("");
  const [busy, setBusy] = useState<"save" | "draft" | "sent" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback((ws?: string) => {
    const url = ws ? `/api/checkins?weekStart=${ws}` : "/api/checkins";
    return fetchJson<CheckinData>(url)
      .then((json) => {
        setData(json);
        setWeekStart(json.weekStart);
        setForm({
          waistIn: json.checkIn?.waistIn?.toString() ?? "",
          strengthTrend: json.checkIn?.strengthTrend ?? "",
          digestion: json.checkIn?.digestion ?? "",
          changeRequests: json.checkIn?.changeRequests ?? "",
          manualNotes: json.checkIn?.manualNotes ?? "",
        });
        setDraft(json.checkIn?.generatedDraft ?? "");
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(errorMessage(err, "Couldn't load this check-in."));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveManual(): Promise<boolean> {
    if (!weekStart) return false;
    setBusy("save");
    setNote(null);
    try {
      await fetchJson("/api/checkins", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          waistIn: form.waistIn ? Number(form.waistIn) : null,
          strengthTrend: form.strengthTrend || null,
          digestion: form.digestion || null,
          changeRequests: form.changeRequests || null,
          manualNotes: form.manualNotes || null,
        }),
      });
      setNote("Saved.");
      return true;
    } catch (err) {
      setNote(errorMessage(err, "Save failed."));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function generateDraft() {
    if (!weekStart) return;
    if (!(await saveManual())) return;
    setBusy("draft");
    setNote(null);
    try {
      const json = await fetchJson<{ generatedDraft: string }>("/api/checkins/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      setDraft(json.generatedDraft);
      setNote("Draft generated — review, copy, and send.");
    } catch (err) {
      setNote(errorMessage(err, "Draft failed."));
    } finally {
      setBusy(null);
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setNote("Copied to clipboard.");
    } catch {
      setNote("Couldn't copy automatically — select the draft text above and copy it manually.");
    }
  }

  async function markSent() {
    if (!weekStart || busy !== null) return;
    setBusy("sent");
    setNote(null);
    try {
      await fetchJson("/api/checkins", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, sent: true }),
      });
      await load(weekStart);
      setNote("Marked as sent.");
    } catch (err) {
      setNote(errorMessage(err, "Couldn't mark as sent."));
    } finally {
      setBusy(null);
    }
  }

  if (!data || !weekStart) {
    return <p className="text-sm text-muted">{loadError ?? "Loading…"}</p>;
  }

  return (
    <div className="space-y-4">
      {loadError && <p className="text-sm text-bad">{loadError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          Coach check-in · week of {weekStart}
          {data.checkIn?.sentAt && (
            <span className="ml-2 rounded bg-good/15 px-2 py-0.5 text-xs font-medium text-good">
              sent {new Date(data.checkIn.sentAt).toLocaleDateString()}
            </span>
          )}
        </h1>
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => load(addDays(weekStart, -7))}
            className="rounded-md border border-borderc px-2 py-1 hover:bg-borderc/30"
          >
            ← previous week
          </button>
          <button
            onClick={() => load(addDays(weekStart, 7))}
            className="rounded-md border border-borderc px-2 py-1 hover:bg-borderc/30"
          >
            next week →
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: template with data prefills + manual fields */}
        <section className="space-y-4 rounded-xl border border-borderc bg-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            The coach&apos;s questions
          </h2>
          <ol className="space-y-3">
            {data.template.map((q) => {
              const dataKey = DATA_ANSWER_KEYS[q.key];
              const prefill = dataKey ? data.dataAnswers[dataKey] : null;
              return (
                <li key={q.key} className="rounded-lg border border-borderc p-3">
                  <p className="text-sm font-medium">{q.question}</p>
                  {prefill && (
                    <p className="mt-1 text-sm text-muted">
                      <span className="mr-1 rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold uppercase text-accent">
                        from data
                      </span>
                      {prefill}
                    </p>
                  )}
                  {q.key === "bodyweight_waist" && (
                    <div className="mt-2 max-w-48">
                      <FormField
                        label="Waist (inches)"
                        value={form.waistIn}
                        onChange={(v) => setForm({ ...form, waistIn: v })}
                        placeholder="e.g. 31.5"
                      />
                    </div>
                  )}
                  {q.key === "strength" && (
                    <div className="mt-2">
                      <FormField
                        label="Your notes"
                        type="textarea"
                        value={form.strengthTrend}
                        onChange={(v) => setForm({ ...form, strengthTrend: v })}
                        placeholder="e.g. Pressing felt flat, pulls still strong…"
                      />
                    </div>
                  )}
                  {q.key === "digestion" && (
                    <div className="mt-2">
                      <FormField
                        label="Your notes"
                        type="textarea"
                        value={form.digestion}
                        onChange={(v) => setForm({ ...form, digestion: v })}
                        placeholder="e.g. Regular, no issues"
                      />
                    </div>
                  )}
                  {q.key === "change_requests" && (
                    <div className="mt-2">
                      <FormField
                        label="Your notes"
                        type="textarea"
                        value={form.changeRequests}
                        onChange={(v) => setForm({ ...form, changeRequests: v })}
                        placeholder="e.g. Would love a few more carbs pre-workout"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <FormField
            label="Anything else for the draft (optional)"
            type="textarea"
            value={form.manualNotes}
            onChange={(v) => setForm({ ...form, manualNotes: v })}
            placeholder="Context you want woven in…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={saveManual}
              disabled={busy !== null}
              className="rounded-md border border-borderc px-3 py-1.5 text-sm font-medium hover:bg-borderc/30 disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : "Save answers"}
            </button>
            <button
              onClick={generateDraft}
              disabled={busy !== null}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy === "draft" ? "Writing draft…" : "Generate check-in draft"}
            </button>
            {note && <span className="text-sm text-muted">{note}</span>}
          </div>
        </section>

        {/* Right: the draft */}
        <section className="flex flex-col rounded-xl border border-borderc bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Filled-in template
          </h2>
          {draft ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={22}
                className="w-full flex-1 rounded-md border border-borderc bg-background px-3 py-2 font-mono text-xs leading-relaxed"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={copyDraft}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Copy
                </button>
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Weekly check-in — ${weekStart}`)}&body=${encodeURIComponent(draft)}`}
                  className="rounded-md border border-borderc px-3 py-1.5 text-sm font-medium hover:bg-borderc/30"
                >
                  Open in email
                </a>
                <button
                  onClick={markSent}
                  disabled={busy !== null}
                  className="rounded-md border border-borderc px-3 py-1.5 text-sm font-medium hover:bg-borderc/30 disabled:opacity-50"
                >
                  {busy === "sent" ? "Marking…" : "Mark as sent"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Fill in the subjective answers on the left, then generate a draft.
              Data-backed questions are answered automatically from your synced
              nutrition, weight, water, sleep, and workout data.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
