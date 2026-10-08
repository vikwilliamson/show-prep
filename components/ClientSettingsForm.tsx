"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PROGRAM_TYPES, PROGRAM_TYPE_LABELS } from "@/lib/program-types";
import { errorMessage, fetchJson } from "@/lib/client-fetch";
import { FormField } from "@/components/FormField";

export interface ClientSettingsShape {
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

export interface ClientTargetsShape {
  waterMlMin: number;
  sleepHoursMin: number;
  workoutsPerWeekMin: number;
  cardioSessionsPerWeek: number;
}

const numberOrNull = (v: string) => (v === "" ? null : Number(v));

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-borderc bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function ClientSettingsForm({
  accountId,
  settings,
  targets,
}: {
  accountId: number;
  settings: ClientSettingsShape;
  targets: ClientTargetsShape;
}) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [t, setT] = useState(targets);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const json = await fetchJson<{ settings: ClientSettingsShape; targets: ClientTargetsShape }>(
        `/api/clients/${accountId}/settings`,
        {
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
        },
      );
      setS(json.settings);
      setT(json.targets);
      setNote("Saved.");
      router.refresh();
    } catch (err) {
      setNote(errorMessage(err, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Section title="Target">
        <FormField
          label="Target name"
          value={s.targetName ?? ""}
          onChange={(v) => setS({ ...s, targetName: v || null })}
        />
        <FormField
          label="Target date"
          type="date"
          value={s.targetDate ?? ""}
          onChange={(v) => setS({ ...s, targetDate: v || null })}
        />
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-muted">Program type</span>
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
        <FormField
          label="Target note (shown in check-ins)"
          value={s.targetNote ?? ""}
          onChange={(v) => setS({ ...s, targetNote: v || null })}
        />
        <FormField
          label="Target weight (lbs)"
          type="number"
          step={0.5}
          value={s.targetWeightLbs?.toString() ?? ""}
          onChange={(v) => setS({ ...s, targetWeightLbs: numberOrNull(v) })}
        />
        <FormField
          label="Height (inches)"
          type="number"
          step={0.5}
          value={s.heightInches?.toString() ?? ""}
          onChange={(v) => setS({ ...s, heightInches: numberOrNull(v) })}
        />
        <FormField
          label="Timezone (day bucketing)"
          value={s.timezone}
          onChange={(v) => setS({ ...s, timezone: v || "America/Los_Angeles" })}
        />
      </Section>

      <Section
        title="Nutrition target"
        hint="Used when there's no active coach protocol. An active protocol overrides these once one exists."
      >
        <FormField
          label="Calories (kcal/day)"
          type="number"
          step={50}
          value={s.targetCalories?.toString() ?? ""}
          onChange={(v) => setS({ ...s, targetCalories: numberOrNull(v) })}
        />
        <FormField
          label="Protein (g/day)"
          type="number"
          value={s.targetProteinG?.toString() ?? ""}
          onChange={(v) => setS({ ...s, targetProteinG: numberOrNull(v) })}
        />
        <FormField
          label="Carbs (g/day)"
          type="number"
          value={s.targetCarbsG?.toString() ?? ""}
          onChange={(v) => setS({ ...s, targetCarbsG: numberOrNull(v) })}
        />
        <FormField
          label="Fat (g/day)"
          type="number"
          value={s.targetFatG?.toString() ?? ""}
          onChange={(v) => setS({ ...s, targetFatG: numberOrNull(v) })}
        />
      </Section>

      <Section title="Weekly targets (check-in thresholds)">
        <FormField
          label="Water minimum (ml/day)"
          type="number"
          step={100}
          value={t.waterMlMin.toString()}
          onChange={(v) => setT({ ...t, waterMlMin: v === "" ? 3000 : Number(v) })}
        />
        <FormField
          label="Sleep minimum (hours/night)"
          type="number"
          step={0.5}
          value={t.sleepHoursMin.toString()}
          onChange={(v) => setT({ ...t, sleepHoursMin: v === "" ? 7 : Number(v) })}
        />
        <FormField
          label="Workouts minimum (days/week)"
          type="number"
          value={t.workoutsPerWeekMin.toString()}
          onChange={(v) => setT({ ...t, workoutsPerWeekMin: v === "" ? 3 : Number(v) })}
        />
        <FormField
          label="Cardio sessions prescribed (per week, 0 = none)"
          type="number"
          value={t.cardioSessionsPerWeek.toString()}
          onChange={(v) => setT({ ...t, cardioSessionsPerWeek: v === "" ? 0 : Number(v) })}
        />
      </Section>

      <div className="flex items-center gap-3">
        <button
          disabled={busy || !s.programType}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save client settings"}
        </button>
        {note && <span className="text-sm text-muted">{note}</span>}
      </div>
    </form>
  );
}
