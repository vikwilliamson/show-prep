"use client";

import { useEffect, useState } from "react";
import { errorMessage, fetchJson } from "@/lib/client-fetch";
import { FormField } from "@/components/FormField";

interface ClientRow {
  id: number;
  name: string;
}

const EMPTY = {
  weightLbs: "",
  sleepHours: "",
  waterMl: "",
  steps: "",
  activeCalories: "",
  totalCalories: "",
};

const SAVED_LABELS: Record<string, string> = {
  weight: "weight",
  sleep: "sleep",
  hydration: "water",
  activity: "activity",
};

// Manual entry fallback (specs/phase-2-open-wearables.md §5): fixes or fills
// in a day's data when the companion app hasn't synced it. Resubmitting a day
// replaces that day's manual entry.
export default function LogPage() {
  const [date, setDate] = useState("");
  const [values, setValues] = useState(EMPTY);
  const [isCoach, setIsCoach] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);

  // GET /api/clients is coach-only — a client session 403s, which is how this
  // page tells the two roles apart (same trick as the Documents page).
  useEffect(() => {
    (async () => {
      try {
        setClients(await fetchJson<ClientRow[]>("/api/clients"));
        setIsCoach(true);
      } catch {
        setIsCoach(false);
      }
    })();
  }, []);

  const set = (key: keyof typeof EMPTY) => (v: string) => setValues({ ...values, [key]: v });
  const hasMeasurement = Object.values(values).some((v) => v !== "");
  const canSave = hasMeasurement && !busy && (!isCoach || accountId !== null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setNote(null);
    try {
      const body: Record<string, unknown> = {};
      if (date) body.date = date;
      if (isCoach && accountId !== null) body.accountId = accountId;
      for (const [key, v] of Object.entries(values)) {
        if (v !== "") body[key] = Number(v);
      }
      const json = await fetchJson<{ saved: string[] }>("/api/manual-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNote({
        text: `Saved ${json.saved.map((s) => SAVED_LABELS[s] ?? s).join(", ")}.`,
        ok: true,
      });
      setValues(EMPTY);
    } catch (err) {
      setNote({ text: errorMessage(err, "Couldn't save."), ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-6">
      {isCoach && (
        <div className="flex items-center gap-2">
          <label htmlFor="log-client-select" className="text-sm font-medium text-muted">
            Client
          </label>
          <select
            id="log-client-select"
            value={accountId ?? ""}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-borderc bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <section className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold tracking-wide text-muted uppercase">
          Log data
        </h2>
        <p className="mb-3 text-xs text-muted">
          For a day the companion app hasn&apos;t synced, or to correct one. Fill in only what you
          have; saving a day again replaces that day&apos;s manual entry. Sleep counts toward the
          day you woke up. Meals and macros aren&apos;t logged here.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Date" type="date" value={date} onChange={setDate} />
          <p className="self-end pb-2 text-xs text-muted">Leave blank for today.</p>
          <FormField
            label="Weight (lbs)"
            type="number"
            step={0.1}
            value={values.weightLbs}
            onChange={set("weightLbs")}
          />
          <FormField
            label="Sleep (hours)"
            type="number"
            step={0.25}
            value={values.sleepHours}
            onChange={set("sleepHours")}
          />
          <FormField
            label="Water (ml)"
            type="number"
            step={100}
            value={values.waterMl}
            onChange={set("waterMl")}
          />
          <FormField label="Steps" type="number" value={values.steps} onChange={set("steps")} />
          <FormField
            label="Active calories"
            type="number"
            value={values.activeCalories}
            onChange={set("activeCalories")}
          />
          <FormField
            label="Total calories"
            type="number"
            value={values.totalCalories}
            onChange={set("totalCalories")}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          disabled={!canSave}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {note && (
          <span className={`text-sm ${note.ok ? "text-good" : "text-bad"}`} role="status">
            {note.text}
          </span>
        )}
      </div>
    </form>
  );
}
