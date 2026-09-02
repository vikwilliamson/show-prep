"use client";

import { useEffect, useState } from "react";
import { PROGRAM_TYPES, PROGRAM_TYPE_LABELS } from "@/lib/program-types";
import { errorMessage, fetchJson } from "@/lib/client-fetch";
import { FormField } from "@/components/FormField";

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
  const [role, setRole] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchJson<{
      settings: SettingsShape;
      targets: TargetsShape;
      referenceId: string;
      role: string;
    }>("/api/settings")
      .then((json) => {
        setS(json.settings);
        setT(json.targets);
        setReferenceId(json.referenceId);
        setRole(json.role);
      })
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load your settings.")));
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
      const json = await fetchJson<{ settings: SettingsShape; targets: TargetsShape }>(
        "/api/settings",
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
    } catch (err) {
      setNote(errorMessage(err, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  if (!s || !t) return <p className="text-sm text-muted">{loadError ?? "Loading…"}</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={save} className="space-y-6">
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
            onChange={(v) => setS({ ...s, targetWeightLbs: v === "" ? null : Number(v) })}
          />
          <FormField
            label="Height (inches)"
            type="number"
            step={0.5}
            value={s.heightInches?.toString() ?? ""}
            onChange={(v) => setS({ ...s, heightInches: v === "" ? null : Number(v) })}
          />
          <FormField
            label="Timezone (day bucketing)"
            value={s.timezone}
            onChange={(v) => setS({ ...s, timezone: v || "America/Los_Angeles" })}
          />
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
          <FormField
            label="Calories (kcal/day)"
            type="number"
            step={50}
            value={s.targetCalories?.toString() ?? ""}
            onChange={(v) => setS({ ...s, targetCalories: v === "" ? null : Number(v) })}
          />
          <FormField
            label="Protein (g/day)"
            type="number"
            value={s.targetProteinG?.toString() ?? ""}
            onChange={(v) => setS({ ...s, targetProteinG: v === "" ? null : Number(v) })}
          />
          <FormField
            label="Carbs (g/day)"
            type="number"
            value={s.targetCarbsG?.toString() ?? ""}
            onChange={(v) => setS({ ...s, targetCarbsG: v === "" ? null : Number(v) })}
          />
          <FormField
            label="Fat (g/day)"
            type="number"
            value={s.targetFatG?.toString() ?? ""}
            onChange={(v) => setS({ ...s, targetFatG: v === "" ? null : Number(v) })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Weekly targets (check-in thresholds)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
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
      {role === "coach" && <AddClientSection />}
    </div>
  );
}

function AddClientSection() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; passcode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const json = await fetchJson<{ account: { name: string }; passcode: string }>(
        "/api/accounts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      setCreated({ name: json.account.name, passcode: json.passcode });
      setName("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't create client."));
    } finally {
      setBusy(false);
    }
  }

  async function copyPasscode() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.passcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — passcode is still selectable text.
    }
  }

  return (
    <section className="rounded-xl border border-borderc bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Add a client
      </h2>
      <form onSubmit={addClient} className="flex items-end gap-2">
        <label className="block flex-1 text-sm">
          <span className="mb-1 block text-muted">Client name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-borderc bg-background px-3 py-1.5"
          />
        </label>
        <button
          disabled={busy || !name.trim()}
          className="shrink-0 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add client"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-muted">{error}</p>}
      {created && (
        <div className="mt-3 rounded-md border border-borderc bg-background p-3">
          <p className="mb-2 text-xs text-muted">
            {created.name}&apos;s passcode — shown once, relay it out-of-band
            (text/call). It can&apos;t be shown again after you leave this page.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={created.passcode}
              onFocus={(e) => e.target.select()}
              className="w-full rounded-md border border-borderc bg-surface px-3 py-1.5 font-mono text-sm"
            />
            <button
              type="button"
              onClick={copyPasscode}
              className="shrink-0 rounded-md border border-borderc px-3 py-1.5 text-sm hover:bg-surface"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
