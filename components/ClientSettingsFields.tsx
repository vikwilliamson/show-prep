"use client";

import { PROGRAM_TYPES, PROGRAM_TYPE_LABELS } from "@/lib/program-types";
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

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-borderc bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function ClientSettingsFields({
  settings: s,
  targets: t,
  onSettingsChange,
  onTargetsChange,
}: {
  settings: ClientSettingsShape;
  targets: ClientTargetsShape;
  onSettingsChange: (next: ClientSettingsShape) => void;
  onTargetsChange: (next: ClientTargetsShape) => void;
}) {
  return (
    <>
      <Section title="Target">
        <FormField
          label="Target name"
          value={s.targetName ?? ""}
          onChange={(v) => onSettingsChange({ ...s, targetName: v || null })}
        />
        <FormField
          label="Target date"
          type="date"
          value={s.targetDate ?? ""}
          onChange={(v) => onSettingsChange({ ...s, targetDate: v || null })}
        />
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-muted">Program type</span>
          <select
            value={s.programType ?? ""}
            onChange={(e) => onSettingsChange({ ...s, programType: e.target.value || null })}
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
          onChange={(v) => onSettingsChange({ ...s, targetNote: v || null })}
        />
        <FormField
          label="Target weight (lbs)"
          type="number"
          step={0.5}
          value={s.targetWeightLbs?.toString() ?? ""}
          onChange={(v) => onSettingsChange({ ...s, targetWeightLbs: numberOrNull(v) })}
        />
        <FormField
          label="Height (inches)"
          type="number"
          step={0.5}
          value={s.heightInches?.toString() ?? ""}
          onChange={(v) => onSettingsChange({ ...s, heightInches: numberOrNull(v) })}
        />
        <FormField
          label="Timezone (day bucketing)"
          value={s.timezone}
          onChange={(v) => onSettingsChange({ ...s, timezone: v || "America/Los_Angeles" })}
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
          onChange={(v) => onSettingsChange({ ...s, targetCalories: numberOrNull(v) })}
        />
        <FormField
          label="Protein (g/day)"
          type="number"
          value={s.targetProteinG?.toString() ?? ""}
          onChange={(v) => onSettingsChange({ ...s, targetProteinG: numberOrNull(v) })}
        />
        <FormField
          label="Carbs (g/day)"
          type="number"
          value={s.targetCarbsG?.toString() ?? ""}
          onChange={(v) => onSettingsChange({ ...s, targetCarbsG: numberOrNull(v) })}
        />
        <FormField
          label="Fat (g/day)"
          type="number"
          value={s.targetFatG?.toString() ?? ""}
          onChange={(v) => onSettingsChange({ ...s, targetFatG: numberOrNull(v) })}
        />
      </Section>

      <Section title="Weekly targets (check-in thresholds)">
        <FormField
          label="Water minimum (ml/day)"
          type="number"
          step={100}
          value={t.waterMlMin.toString()}
          onChange={(v) => onTargetsChange({ ...t, waterMlMin: v === "" ? 3000 : Number(v) })}
        />
        <FormField
          label="Sleep minimum (hours/night)"
          type="number"
          step={0.5}
          value={t.sleepHoursMin.toString()}
          onChange={(v) => onTargetsChange({ ...t, sleepHoursMin: v === "" ? 7 : Number(v) })}
        />
        <FormField
          label="Workouts minimum (days/week)"
          type="number"
          value={t.workoutsPerWeekMin.toString()}
          onChange={(v) => onTargetsChange({ ...t, workoutsPerWeekMin: v === "" ? 3 : Number(v) })}
        />
        <FormField
          label="Cardio sessions prescribed (per week, 0 = none)"
          type="number"
          value={t.cardioSessionsPerWeek.toString()}
          onChange={(v) =>
            onTargetsChange({ ...t, cardioSessionsPerWeek: v === "" ? 0 : Number(v) })
          }
        />
      </Section>
    </>
  );
}
