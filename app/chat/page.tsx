"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: { documentId: number; title: string; chunkIndex: number }[] | null;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then(setMessages);
  }, []);

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
      ...m,
      { id: -Date.now(), role: "user", content: message, sources: null },
    ]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessages((m) => [...m.slice(0, -1), json.user, json.assistant]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm("Clear the whole conversation?")) return;
    await fetch("/api/chat", { method: "DELETE" });
    setMessages([]);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Chat with your documents</h1>
        {messages.length > 0 && (
          <button onClick={clear} className="text-xs text-muted hover:text-bad">
            clear history
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-borderc bg-surface p-4">
        {messages.length === 0 && (
          <div className="py-12 text-center text-sm text-muted">
            <p>Ask anything grounded in your uploads, e.g.</p>
            <p className="mt-2 italic">
              “What did coach say about peak week sodium?” · “What&apos;s the posing
              suit rule for Classic?” · “When do my carbs drop next?”
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "ml-auto bg-accent/15"
                : "mr-auto border border-borderc bg-background"
            }`}
          >
            {m.content}
            {m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <p className="mt-2 border-t border-borderc pt-1 text-xs text-muted">
                Sources: {m.sources.map((s) => s.title).join(" · ")}
              </p>
            )}
          </div>
        ))}
        {busy && (
          <div className="mr-auto max-w-[85%] rounded-xl border border-borderc bg-background px-3 py-2 text-sm text-muted">
            Searching your documents…
          </div>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your protocols or division rules…"
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
