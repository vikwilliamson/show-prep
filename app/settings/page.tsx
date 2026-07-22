"use client";

import { useEffect, useState } from "react";
import { DIVISIONS, DIVISION_LABELS } from "@/lib/divisions";

interface SettingsShape {
  showName: string | null;
  showDate: string | null;
  divisions: string[];
  nextCompetitionNote: string | null;
  targetStageWeightLbs: number | null;
  heightInches: number | null;
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
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((json) => {
        setS(json.settings);
        setT(json.targets);
      });
  }, []);

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
            showName: s.showName,
            showDate: s.showDate,
            divisions: s.divisions,
            nextCompetitionNote: s.nextCompetitionNote,
            targetStageWeightLbs: s.targetStageWeightLbs,
            heightInches: s.heightInches,
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
          Show
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("Show name", s.showName, (v) => setS({ ...s, showName: v }))}
          {text("Show date", s.showDate, (v) => setS({ ...s, showDate: v }), {
            type: "date",
          })}
          <div className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">
              Divisions (cross-competing? check more than one)
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {DIVISIONS.map((d) => {
                const checked = s.divisions.includes(d);
                return (
                  <label key={d} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setS({
                          ...s,
                          divisions: checked
                            ? s.divisions.filter((x) => x !== d)
                            : [...s.divisions, d],
                        })
                      }
                    />
                    {DIVISION_LABELS[d]}
                  </label>
                );
              })}
            </div>
          </div>
          {text(
            "Next competition note (shown in check-ins)",
            s.nextCompetitionNote,
            (v) => setS({ ...s, nextCompetitionNote: v }),
          )}
          {num("Target stage weight (lbs)", s.targetStageWeightLbs, (v) =>
            setS({ ...s, targetStageWeightLbs: v }), 0.5)}
          {num("Height (inches — for the weight cap)", s.heightInches, (v) =>
            setS({ ...s, heightInches: v }), 0.5)}
          {text("Timezone (day bucketing)", s.timezone, (v) =>
            setS({ ...s, timezone: v ?? "America/Los_Angeles" }))}
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
          disabled={busy || s.divisions.length === 0}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
        {note && <span className="text-sm text-muted">{note}</span>}
      </div>
    </form>
  );
}
