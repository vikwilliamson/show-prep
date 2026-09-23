"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, fetchJson } from "@/lib/client-fetch";
import { AiBadge } from "@/components/AiBadge";
import { MarkdownContent } from "@/components/MarkdownContent";

// Deliberate v1 choice (specs/coach-client-scoped-workspace.md §2): no
// websocket infra exists in this codebase, so a coach's/client's messages
// become visible to the other party via polling, not push.
const POLL_MS = 7000;

function TypingIndicator() {
  return (
    <div className="mr-auto flex items-center gap-1 rounded-xl border border-borderc bg-background px-3 py-2.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: { documentId: number; title: string; chunkIndex: number }[] | null;
  senderAccountId?: number;
  senderName?: string | null;
  isOwnMessage?: boolean;
}

interface ClientRow {
  id: number;
  name: string;
  createdAt: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCoach, setIsCoach] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // GET /api/clients is coach-only — a client session 403s, which is how
  // this page tells the two roles apart without a dedicated endpoint (see
  // specs/coach-client-scoped-workspace.md §0), same trick as /documents.
  useEffect(() => {
    (async () => {
      try {
        const list = await fetchJson<ClientRow[]>("/api/clients");
        setIsCoach(true);
        setClients(list);
      } catch {
        setIsCoach(false);
      }
    })();
  }, []);

  const scopeQuery = selectedAccountId != null ? `?accountId=${selectedAccountId}` : "";

  const refresh = useCallback(() => {
    return fetchJson<Message[]>(`/api/chat${scopeQuery}`)
      .then((rows) => {
        setMessages(rows);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(errorMessage(err, "Couldn't load your conversation."));
      });
  }, [scopeQuery]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!busyRef.current) refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    // Optimistic user bubble.
    setMessages((m) => [
      ...(m ?? []),
      { id: -Date.now(), role: "user", content: message, sources: null, isOwnMessage: true },
    ]);
    try {
      const json = await fetchJson<{ user: Message; assistant: Message }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          ...(selectedAccountId != null ? { accountId: selectedAccountId } : {}),
        }),
      });
      setMessages((m) => [...(m ?? []).slice(0, -1), json.user, json.assistant]);
    } catch (err) {
      // Roll back the optimistic bubble — it never actually sent — and give
      // the user their text back so they don't have to retype it.
      setMessages((m) => (m ?? []).slice(0, -1));
      setInput(message);
      setError(errorMessage(err, "Message failed to send."));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    // A coach-triggered cross-account delete is a real footgun worth naming
    // plainly, not a silent one (specs/coach-client-scoped-workspace.md §2).
    const clientName =
      selectedAccountId != null ? clients.find((c) => c.id === selectedAccountId)?.name : null;
    const confirmText = clientName
      ? `Clear ${clientName}'s whole conversation?`
      : "Clear the whole conversation?";
    if (!confirm(confirmText)) return;
    setBusy(true);
    try {
      await fetchJson(`/api/chat${scopeQuery}`, { method: "DELETE" });
      setMessages([]);
    } catch (err) {
      setError(errorMessage(err, "Couldn't clear the conversation."));
    } finally {
      setBusy(false);
    }
  }

  if (messages === null) {
    return <p className="text-sm text-muted">{loadError ?? "Loading…"}</p>;
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Chat with your documents</h1>
        <div className="flex items-center gap-3">
          {isCoach && (
            <div className="flex items-center gap-2">
              <label htmlFor="chat-client-select" className="text-sm font-medium text-muted">
                Client
              </label>
              <select
                id="chat-client-select"
                aria-label="Client"
                value={selectedAccountId ?? ""}
                onChange={(e) =>
                  setSelectedAccountId(e.target.value ? Number(e.target.value) : null)
                }
                className="rounded-md border border-borderc bg-background px-3 py-1.5 text-sm"
              >
                <option value="">My own conversation</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {messages.length > 0 && (
            <button onClick={clear} disabled={busy} className="text-xs text-muted hover:text-bad disabled:opacity-50">
              clear history
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-borderc bg-surface p-4">
        {messages.length === 0 && (
          <div className="py-12 text-center text-sm text-muted">
            <p>Ask anything grounded in your uploads, e.g.</p>
            <p className="mt-2 italic">
              “What did coach say about sodium this phase?” · “What are the
              program rules for weigh-ins?” · “When do my carbs drop next?”
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto whitespace-pre-wrap bg-accent/15"
                : "mr-auto border border-borderc bg-background"
            }`}
          >
            {m.role === "assistant" ? (
              <>
                <AiBadge
                  className="mb-1.5"
                  detail="Grounded in your uploaded documents, with sources cited below."
                />
                <MarkdownContent content={m.content} />
              </>
            ) : (
              <>
                <p className="mb-1 text-xs font-medium text-muted">
                  {m.isOwnMessage === false ? m.senderName ?? "Them" : "You"}
                </p>
                {m.content}
              </>
            )}
            {m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <p className="mt-2 border-t border-borderc pt-1 text-xs text-muted">
                Sources: {m.sources.map((s) => s.title).join(" · ")}
              </p>
            )}
          </div>
        ))}
        {busy && <TypingIndicator />}
        {error && <p className="text-sm text-bad">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your protocols or program rules…"
          aria-label="Message"
          className="flex-1 rounded-md border border-borderc bg-surface px-3 py-2 text-sm"
        />
        <button
          disabled={busy || !input.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
