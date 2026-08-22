"use client";

import { useEffect, useState } from "react";
import { PROGRAM_TYPES, PROGRAM_TYPE_LABELS } from "@/lib/program-types";

interface SettingsShape {
  targetName: string | null;
  targetDate: string | null;
  programType: string | null;
  targetNote: string | null;
  targetWeightLbs: number | null;
  heightInches: number | null;
  targetCalories: number | null;
  targetProteinG: number | null;
  targetCarbsG: number | null;
  targetFatG: number | null;
  timezone: string;
}

interface TargetsShape {
  waterMlMin: number;
  sleepHoursMin: number;
  workoutsPerWeekMin: number;
  cardioSessionsPerWeek: number;
}

export default function SettingsPage() {
  const [s, setS] = useState<SettingsShape | null>(null);
  const [t, setT] = useState<TargetsShape | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((json) => {
        setS(json.settings);
        setT(json.targets);
        setReferenceId(json.referenceId);
      });
  }, []);

  async function copyReferenceId() {
    if (!referenceId) return;
    try {
      await navigator.clipboard.writeText(referenceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied (some browsers require a user-initiated
      // event they don't consider this to be, or block it outright) — the
      // field is still selectable, so fall back to select-then-Cmd/Ctrl+C.
      setNote("Couldn't copy automatically — select the ID above and copy it manually.");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s || !t) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            targetName: s.targetName,
            targetDate: s.targetDate,
            programType: s.programType,
            targetNote: s.targetNote,
            targetWeightLbs: s.targetWeightLbs,
            heightInches: s.heightInches,
            targetCalories: s.targetCalories,
            targetProteinG: s.targetProteinG,
            targetCarbsG: s.targetCarbsG,
            targetFatG: s.targetFatG,
            timezone: s.timezone,
          },
          targets: t,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setS(json.settings);
      setT(json.targets);
      setNote("Saved.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!s || !t) return <p className="text-sm text-muted">Loading…</p>;

  const text = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        {...props}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-borderc bg-background px-3 py-1.5"
      />
    </label>
  );

  const num = (
    label: string,
    value: number | null,
    onChange: (v: number | null) => void,
    step = 1,
  ) => (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
        className="w-full rounded-md border border-borderc bg-background px-3 py-1.5 tabular-nums"
      />
    </label>
  );

  return (
    <form onSubmit={save} className="max-w-2xl space-y-6">
      <section className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Companion pairing ID
        </h2>
        <p className="mb-3 text-xs text-muted">
          Paste this into the mobile companion app&apos;s Pairing ID field so
          it knows which account to sync your Health Connect data to.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={referenceId ?? ""}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-md border border-borderc bg-background px-3 py-1.5 font-mono text-sm"
          />
          <button
            type="button"
            onClick={copyReferenceId}
            className="shrink-0 rounded-md border border-borderc px-3 py-1.5 text-sm hover:bg-background"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Target
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("Target name", s.targetName, (v) => setS({ ...s, targetName: v }))}
          {text("Target date", s.targetDate, (v) => setS({ ...s, targetDate: v }), {
            type: "date",
          })}
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Program type</span>
            <select
              value={s.programType ?? ""}
              onChange={(e) => setS({ ...s, programType: e.target.value || null })}
              className="w-full rounded-md border border-borderc bg-background px-3 py-1.5"
            >
              <option value="">Select a program type…</option>
              {PROGRAM_TYPES.map((p) => (
                <option key={p} value={p}>
                  {PROGRAM_TYPE_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          {text(
            "Target note (shown in check-ins)",
            s.targetNote,
            (v) => setS({ ...s, targetNote: v }),
          )}
          {num("Target weight (lbs)", s.targetWeightLbs, (v) =>
            setS({ ...s, targetWeightLbs: v }), 0.5)}
          {num("Height (inches)", s.heightInches, (v) =>
            setS({ ...s, heightInches: v }), 0.5)}
          {text("Timezone (day bucketing)", s.timezone, (v) =>
            setS({ ...s, timezone: v ?? "America/Los_Angeles" }))}
        </div>
      </section>

      <section className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Nutrition target
        </h2>
        <p className="mb-3 text-xs text-muted">
          Used when there&apos;s no active coach protocol. An active protocol
          overrides these once one exists.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {num("Calories (kcal/day)", s.targetCalories, (v) =>
            setS({ ...s, targetCalories: v }), 50)}
          {num("Protein (g/day)", s.targetProteinG, (v) =>
            setS({ ...s, targetProteinG: v }))}
          {num("Carbs (g/day)", s.targetCarbsG, (v) =>
            setS({ ...s, targetCarbsG: v }))}
          {num("Fat (g/day)", s.targetFatG, (v) =>
            setS({ ...s, targetFatG: v }))}
        </div>
      </section>

      <section className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Weekly targets (check-in thresholds)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {num("Water minimum (ml/day)", t.waterMlMin, (v) =>
            setT({ ...t, waterMlMin: v ?? 3000 }), 100)}
          {num("Sleep minimum (hours/night)", t.sleepHoursMin, (v) =>
            setT({ ...t, sleepHoursMin: v ?? 7 }), 0.5)}
          {num("Workouts minimum (days/week)", t.workoutsPerWeekMin, (v) =>
            setT({ ...t, workoutsPerWeekMin: v ?? 3 }))}
          {num("Cardio sessions prescribed (per week, 0 = none)", t.cardioSessionsPerWeek, (v) =>
            setT({ ...t, cardioSessionsPerWeek: v ?? 0 }))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          disabled={busy || !s.programType}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
        {note && <span className="text-sm text-muted">{note}</span>}
      </div>
    </form>
  );
}
