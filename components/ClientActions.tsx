"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, fetchJson } from "@/lib/client-fetch";

// Edit is scoped to name/email only — passcode rotation is out of scope
// here (specs/mobile-companion-onboarding.md). Delete requires typing the
// client's exact name before the real delete button enables: this is a
// cascading, irreversible destruction of every record tied to the account
// (VIK-78's ON DELETE CASCADE), so a single click isn't enough.
export function ClientActions({
  accountId,
  name: initialName,
  email: initialEmail,
}: {
  accountId: number;
  name: string;
  email: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const json = await fetchJson<{ account: { name: string; email: string | null } }>(
        `/api/accounts/${accountId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email: email.trim() || null }),
        },
      );
      setName(json.account.name);
      setEmail(json.account.email ?? "");
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
      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-borderc bg-background px-3 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-borderc bg-background px-3 py-1.5"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setName(initialName);
            setEmail(initialEmail ?? "");
            setError(null);
          }}
          className="rounded-md border border-borderc px-3 py-1.5 text-sm font-medium hover:bg-background"
        >
          Cancel
        </button>
        {error && <p className="w-full text-sm text-bad">{error}</p>}
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

  return (
    <div className="flex gap-2">
      <button
        onClick={() => setEditing(true)}
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
  );
}
