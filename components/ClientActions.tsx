"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, fetchJson } from "@/lib/client-fetch";
import { programTypeLabel } from "@/lib/program-types";
import { useEditing } from "@/components/ClientEditMode";
import {
  ClientSettingsFields,
  type ClientSettingsShape,
  type ClientTargetsShape,
} from "@/components/ClientSettingsFields";

// The client page is read-only until the coach clicks Edit; Edit reveals one
// form covering name/email (accounts) and everything per-client (settings +
// weekly targets). Delete requires typing the client's exact name before the
// real delete button enables: this is a cascading, irreversible destruction
// of every record tied to the account (VIK-78's ON DELETE CASCADE), so a
// single click isn't enough. Passcode rotation stays out of scope
// (specs/mobile-companion-onboarding.md).
export function ClientActions({
  accountId,
  name: initialName,
  email: initialEmail,
  settings: initialSettings,
  targets: initialTargets,
}: {
  accountId: number;
  name: string;
  email: string | null;
  settings: ClientSettingsShape;
  targets: ClientTargetsShape;
}) {
  const router = useRouter();

  // Last saved values — what the read-only view shows. Updated from the
  // server's responses on save so the page reflects an edit immediately,
  // without waiting for router.refresh() to re-render the server tiles.
  const [saved, setSaved] = useState({
    name: initialName,
    email: initialEmail,
    settings: initialSettings,
    targets: initialTargets,
  });
  const [editing, setEditing] = useEditing();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [settings, setSettings] = useState(initialSettings);
  const [targets, setTargets] = useState(initialTargets);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function startEditing() {
    setName(saved.name);
    setEmail(saved.email ?? "");
    setSettings(saved.settings);
    setTargets(saved.targets);
    setError(null);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const account = await fetchJson<{ account: { name: string; email: string | null } }>(
        `/api/accounts/${accountId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email: email.trim() || null }),
        },
      );
      // Keep the read-only view truthful even if the settings call below fails.
      setSaved((prev) => ({
        ...prev,
        name: account.account.name,
        email: account.account.email,
      }));

      const updated = await fetchJson<{
        settings: ClientSettingsShape;
        targets: ClientTargetsShape;
      }>(`/api/clients/${accountId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            targetName: settings.targetName,
            targetDate: settings.targetDate,
            programType: settings.programType,
            targetNote: settings.targetNote,
            targetWeightLbs: settings.targetWeightLbs,
            heightInches: settings.heightInches,
            targetCalories: settings.targetCalories,
            targetProteinG: settings.targetProteinG,
            targetCarbsG: settings.targetCarbsG,
            targetFatG: settings.targetFatG,
            timezone: settings.timezone,
          },
          targets,
        }),
      });
      setSaved((prev) => ({ ...prev, settings: updated.settings, targets: updated.targets }));
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save changes."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (confirmText.trim() !== initialName) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await fetchJson(`/api/accounts/${accountId}`, { method: "DELETE" });
      router.push("/clients");
      router.refresh();
    } catch (err) {
      setDeleteError(errorMessage(err, "Couldn't delete client."));
      setDeleteBusy(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-4">
        <section className="rounded-xl border border-borderc bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
            Client
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-muted">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-borderc bg-background px-3 py-1.5 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-muted">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-borderc bg-background px-3 py-1.5 text-sm"
              />
            </label>
          </div>
        </section>

        <ClientSettingsFields
          settings={settings}
          targets={targets}
          onSettingsChange={setSettings}
          onTargetsChange={setTargets}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="rounded-md border border-borderc px-4 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50"
          >
            Cancel
          </button>
          {error && <p className="w-full text-sm text-bad">{error}</p>}
        </div>
      </form>
    );
  }

  if (deleting) {
    return (
      <div className="space-y-2 rounded-md border border-bad/40 bg-bad/5 p-3">
        <p className="text-sm text-bad">
          This permanently deletes {initialName} and every record tied to them — nutrition,
          weight, documents, briefs, everything. Type <strong>{initialName}</strong> to confirm.
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={initialName}
          className="w-full rounded-md border border-borderc bg-background px-3 py-1.5 text-sm"
        />
        {deleteError && <p className="text-sm text-bad">{deleteError}</p>}
        <div className="flex gap-2">
          <button
            onClick={confirmDelete}
            disabled={deleteBusy || confirmText.trim() !== initialName}
            className="rounded-md bg-bad px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {deleteBusy ? "Deleting…" : "Delete permanently"}
          </button>
          <button
            onClick={() => {
              setDeleting(false);
              setConfirmText("");
              setDeleteError(null);
            }}
            className="rounded-md border border-borderc px-3 py-1.5 text-sm font-medium hover:bg-background"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const s = saved.settings;
  const t = saved.targets;
  const rows: [string, string][] = [
    ["Email", saved.email ?? "—"],
    ["Target", s.targetName ?? "—"],
    ["Target date", s.targetDate ?? "—"],
    ["Program type", s.programType ? programTypeLabel(s.programType) : "—"],
    ["Target note", s.targetNote ?? "—"],
    ["Target weight", s.targetWeightLbs != null ? `${s.targetWeightLbs} lbs` : "—"],
    ["Height", s.heightInches != null ? `${s.heightInches} in` : "—"],
    ["Timezone", s.timezone],
    [
      "Nutrition target",
      s.targetCalories != null
        ? `${s.targetCalories} kcal · ${s.targetProteinG ?? "?"}P / ${s.targetCarbsG ?? "?"}C / ${s.targetFatG ?? "?"}F`
        : "—",
    ],
    [
      "Weekly targets",
      `${t.waterMlMin} ml water · ${t.sleepHoursMin}h sleep · ${t.workoutsPerWeekMin} workouts/wk · ${t.cardioSessionsPerWeek} cardio/wk`,
    ],
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={startEditing}
          className="rounded-md border border-borderc px-3 py-1.5 text-sm font-medium hover:bg-background"
        >
          Edit
        </button>
        <button
          onClick={() => setDeleting(true)}
          className="rounded-md border border-bad px-3 py-1.5 text-sm font-medium text-bad hover:bg-bad/10"
        >
          Delete
        </button>
      </div>
      <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-borderc bg-surface p-4 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
