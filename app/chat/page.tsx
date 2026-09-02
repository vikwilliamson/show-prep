"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { errorMessage, fetchJson } from "@/lib/client-fetch";

const markdownComponents: Components = {
  p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
  ul: ({ ...props }) => <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0" {...props} />,
  ol: ({ ...props }) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0" {...props} />,
  li: ({ ...props }) => <li {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold" {...props} />,
  a: ({ ...props }) => (
    <a className="text-accent underline" target="_blank" rel="noreferrer" {...props} />
  ),
  code: ({ ...props }) => (
    <code className="rounded bg-borderc/40 px-1 py-0.5 font-mono text-xs" {...props} />
  ),
  pre: ({ ...props }) => (
    <pre className="mb-2 overflow-x-auto rounded-md bg-borderc/40 p-2 font-mono text-xs last:mb-0" {...props} />
  ),
};

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
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchJson<Message[]>("/api/chat")
      .then(setMessages)
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load your conversation.")));
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
      ...(m ?? []),
      { id: -Date.now(), role: "user", content: message, sources: null },
    ]);
    try {
      const json = await fetchJson<{ user: Message; assistant: Message }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
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
    if (!confirm("Clear the whole conversation?")) return;
    setBusy(true);
    try {
      await fetchJson("/api/chat", { method: "DELETE" });
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
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Chat with your documents</h1>
        {messages.length > 0 && (
          <button onClick={clear} disabled={busy} className="text-xs text-muted hover:text-bad disabled:opacity-50">
            clear history
          </button>
        )}
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
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {m.content}
              </ReactMarkdown>
            ) : (
              m.content
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
