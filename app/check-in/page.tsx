"use client";

import { useCallback, useEffect, useState } from "react";

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
  next_competition: "next_competition",
};

function shiftWeek(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + weeks * 7));
  return dt.toISOString().slice(0, 10);
}

export default function CheckInPage() {
  const [data, setData] = useState<CheckinData | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [form, setForm] = useState({
    waistIn: "",
    strengthTrend: "",
    digestion: "",
    changeRequests: "",
    manualNotes: "",
  });
  const [draft, setDraft] = useState<string>("");
  const [busy, setBusy] = useState<"save" | "draft" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback((ws?: string) => {
    const url = ws ? `/api/checkins?weekStart=${ws}` : "/api/checkins";
    return fetch(url)
      .then((r) => r.json())
      .then((json: CheckinData) => {
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
      const res = await fetch("/api/checkins", {
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
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setNote("Saved.");
      return true;
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Save failed");
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
      const res = await fetch("/api/checkins/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Draft failed");
      setDraft(json.generatedDraft);
      setNote("Draft generated — review, copy, and send.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setBusy(null);
    }
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(draft);
    setNote("Copied to clipboard.");
  }

  async function markSent() {
    if (!weekStart) return;
    await fetch("/api/checkins", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart, sent: true }),
    });
    await load(weekStart);
    setNote("Marked as sent.");
  }

  if (!data || !weekStart) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const manualField = (
    label: string,
    key: keyof typeof form,
    placeholder: string,
    textarea = true,
  ) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {textarea ? (
        <textarea
          rows={2}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
          className="w-full rounded-md border border-borderc bg-background px-3 py-2 text-sm"
        />
      ) : (
        <input
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
          className="w-full rounded-md border border-borderc bg-background px-3 py-1.5 text-sm"
        />
      )}
    </label>
  );

  return (
    <div className="space-y-4">
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
            onClick={() => load(shiftWeek(weekStart, -1))}
            className="rounded-md border border-borderc px-2 py-1 hover:bg-borderc/30"
          >
            ← previous week
          </button>
          <button
            onClick={() => load(shiftWeek(weekStart, 1))}
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
                      {manualField("Waist (inches)", "waistIn", "e.g. 31.5", false)}
                    </div>
                  )}
                  {q.key === "strength" && (
                    <div className="mt-2">
                      {manualField("Your notes", "strengthTrend", "e.g. Pressing felt flat, pulls still strong…")}
                    </div>
                  )}
                  {q.key === "digestion" && (
                    <div className="mt-2">
                      {manualField("Your notes", "digestion", "e.g. Regular, no issues")}
                    </div>
                  )}
                  {q.key === "change_requests" && (
                    <div className="mt-2">
                      {manualField("Your notes", "changeRequests", "e.g. Would love a few more carbs pre-workout")}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {manualField("Anything else for the draft (optional)", "manualNotes", "Context you want woven in…")}
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
                  className="rounded-md border border-borderc px-3 py-1.5 text-sm font-medium hover:bg-borderc/30"
                >
                  Mark as sent
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
