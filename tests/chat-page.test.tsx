// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPage from "@/app/chat/page";

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock("@/lib/client-fetch", () => ({
  fetchJson: fetchJsonMock,
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

// Default: no coach client-selector (GET /api/clients 403s, same "how a
// client session tells itself apart" trick as DocumentsPage), empty thread.
function mockDefault() {
  fetchJsonMock.mockImplementation((url: string) => {
    if (url === "/api/clients") return Promise.reject(new Error("Forbidden"));
    if (String(url).startsWith("/api/chat")) return Promise.resolve([]);
    throw new Error(`unexpected fetchJson call: ${url}`);
  });
}

async function renderReady() {
  mockDefault();
  render(<ChatPage />);
  await screen.findByPlaceholderText("Ask about your protocols or program rules…");
}

describe("ChatPage accessibility", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("gives the message field an accessible name, not just a placeholder", async () => {
    await renderReady();
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
  });
});

describe("ChatPage send guard", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("rolls back the optimistic bubble and shows an error when the send fails, instead of leaving a phantom sent bubble", async () => {
    const user = userEvent.setup();
    await renderReady();

    fetchJsonMock.mockRejectedValueOnce(new Error("Message failed to send."));

    const input = screen.getByPlaceholderText("Ask about your protocols or program rules…");
    await user.type(input, "What's my sodium target?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // The optimistic bubble gets rolled back once the POST rejects, replaced
    // by an error, with the user's text restored to the input instead of
    // vanishing or being left stuck as a phantom "sent" bubble.
    await waitFor(() => {
      expect(screen.getByText("Message failed to send.")).toBeInTheDocument();
    });
    expect(screen.queryByText("What's my sodium target?")).not.toBeInTheDocument();
    expect(input).toHaveValue("What's my sodium target?");
  });

  it("disables Send while a message is in flight, so a rapid double-click only fires one request", async () => {
    const user = userEvent.setup();
    await renderReady();

    let resolveSend!: (value: unknown) => void;
    const sendPromise = new Promise((resolve) => {
      resolveSend = resolve;
    });
    fetchJsonMock.mockReturnValueOnce(sendPromise);

    const input = screen.getByPlaceholderText("Ask about your protocols or program rules…");
    await user.type(input, "Hello");
    const sendButton = screen.getByRole("button", { name: "Send" });
    await user.click(sendButton);

    await waitFor(() => expect(sendButton).toBeDisabled());
    await user.click(sendButton);

    expect(
      fetchJsonMock.mock.calls.filter(
        ([url, init]) => url === "/api/chat" && (init as RequestInit)?.method === "POST",
      ),
    ).toHaveLength(1);

    resolveSend({
      user: { id: 1, role: "user", content: "Hello", sources: null, isOwnMessage: true },
      assistant: { id: 2, role: "assistant", content: "Hi!", sources: null, isOwnMessage: true },
    });
    // Once the request settles, the real assistant reply replaces the
    // optimistic bubble — confirming the guard released rather than the
    // page getting stuck disabled forever.
    await screen.findByText("Hi!");
  });
});

describe("ChatPage AI transparency badge", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("shows the AI-assisted badge on assistant bubbles but not the user's own messages", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/clients") return Promise.reject(new Error("Forbidden"));
      if (String(url).startsWith("/api/chat")) {
        return Promise.resolve([
          { id: 1, role: "user", content: "What's my sodium target?", sources: null, isOwnMessage: true },
          { id: 2, role: "assistant", content: "Aim for under 2,300mg.", sources: null, isOwnMessage: true },
        ]);
      }
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<ChatPage />);

    await screen.findByText("Aim for under 2,300mg.");
    expect(screen.getAllByText("AI-assisted")).toHaveLength(1);
  });

  it("shows no badge in the empty state before any messages exist", async () => {
    await renderReady();
    expect(screen.queryByText("AI-assisted")).not.toBeInTheDocument();
  });
});

describe("ChatPage markdown rendering", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("renders Markdown formatting in assistant replies instead of literal syntax characters", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/clients") return Promise.reject(new Error("Forbidden"));
      if (String(url).startsWith("/api/chat")) {
        return Promise.resolve([
          {
            id: 1,
            role: "assistant",
            content: "## Heading\n\n- list item\n\n**bold text**",
            sources: null,
            isOwnMessage: true,
          },
        ]);
      }
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<ChatPage />);

    expect(await screen.findByRole("heading", { level: 2, name: "Heading" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("list item");
    expect(screen.getByText("bold text").tagName).toBe("STRONG");
  });
});

const CLIENTS = [
  { id: 10, name: "Alex Client", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: 11, name: "Sam Client", createdAt: "2026-01-02T00:00:00.000Z" },
];

describe("ChatPage coach client-selector", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("does not render a client selector for a client session (GET /api/clients 403s)", async () => {
    await renderReady();
    expect(screen.queryByLabelText("Client")).not.toBeInTheDocument();
  });

  it("renders a client selector for a coach session, sourced from GET /api/clients", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/clients") return Promise.resolve(CLIENTS);
      if (String(url).startsWith("/api/chat")) return Promise.resolve([]);
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<ChatPage />);

    const select = await screen.findByLabelText("Client");
    expect(screen.getByRole("option", { name: "Alex Client" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sam Client" })).toBeInTheDocument();
    expect(select).toHaveValue("");
  });

  it("defaults to the coach's own account: no accountId param on initial load", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/clients") return Promise.resolve(CLIENTS);
      if (String(url).startsWith("/api/chat")) return Promise.resolve([]);
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<ChatPage />);

    await screen.findByLabelText("Client");
    expect(fetchJsonMock.mock.calls.some(([url]) => url === "/api/chat")).toBe(true);
    expect(
      fetchJsonMock.mock.calls.some(([url]) => String(url).includes("accountId")),
    ).toBe(false);
  });

  it("selecting a client re-scopes the GET /api/chat fetch and includes the accountId on send", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/clients") return Promise.resolve(CLIENTS);
      if (url === "/api/chat" || url === "/api/chat?accountId=10") return Promise.resolve([]);
      if (url === "/api/chat" && init?.method === "POST") {
        return Promise.resolve({
          user: { id: 1, role: "user", content: "hi", sources: null, isOwnMessage: true },
          assistant: { id: 2, role: "assistant", content: "hello", sources: null, isOwnMessage: true },
        });
      }
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<ChatPage />);

    const select = await screen.findByLabelText("Client");
    fetchJsonMock.mockClear();
    await user.selectOptions(select, "10");

    await waitFor(() => {
      expect(fetchJsonMock.mock.calls.some(([url]) => url === "/api/chat?accountId=10")).toBe(true);
    });

    fetchJsonMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        expect(body.accountId).toBe(10);
        return Promise.resolve({
          user: { id: 1, role: "user", content: "hi", sources: null, isOwnMessage: true },
          assistant: { id: 2, role: "assistant", content: "hello", sources: null, isOwnMessage: true },
        });
      }
      return Promise.resolve([]);
    });
    await user.type(screen.getByPlaceholderText("Ask about your protocols or program rules…"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("hello");
  });
});

describe("ChatPage sender labels", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("labels the viewer's own message 'You' and the other party's message with their senderName", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/clients") return Promise.reject(new Error("Forbidden"));
      if (String(url).startsWith("/api/chat")) {
        return Promise.resolve([
          {
            id: 1,
            role: "user",
            content: "coach's message",
            sources: null,
            senderAccountId: 99,
            senderName: "Coach Alex",
            isOwnMessage: false,
          },
          {
            id: 2,
            role: "user",
            content: "client's own message",
            sources: null,
            senderAccountId: 5,
            senderName: "Client Sam",
            isOwnMessage: true,
          },
        ]);
      }
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<ChatPage />);

    await screen.findByText("coach's message");
    expect(screen.getByText("Coach Alex")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByText("Client Sam")).not.toBeInTheDocument();
  });
});

describe("ChatPage clear confirmation copy", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
    vi.restoreAllMocks();
  });

  it("uses generic copy when clearing your own conversation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/clients") return Promise.reject(new Error("Forbidden"));
      if (String(url).startsWith("/api/chat")) {
        return Promise.resolve([
          { id: 1, role: "user", content: "hi", sources: null, isOwnMessage: true },
        ]);
      }
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<ChatPage />);

    await user.click(await screen.findByRole("button", { name: "clear history" }));
    expect(confirmSpy).toHaveBeenCalledWith("Clear the whole conversation?");
  });

  it("names the client explicitly when a coach clears a client's thread", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/clients") return Promise.resolve(CLIENTS);
      if (url === "/api/chat" || url === "/api/chat?accountId=10")
        return Promise.resolve([
          { id: 1, role: "user", content: "hi", sources: null, isOwnMessage: true },
        ]);
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<ChatPage />);

    const select = await screen.findByLabelText("Client");
    await user.selectOptions(select, "10");
    await user.click(await screen.findByRole("button", { name: "clear history" }));
    expect(confirmSpy).toHaveBeenCalledWith("Clear Alex Client's whole conversation?");
  });
});

describe("ChatPage polling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    fetchJsonMock.mockReset();
  });

  it("polls GET /api/chat on an interval (5-10s) while the page is open", async () => {
    mockDefault();
    render(<ChatPage />);
    await vi.waitFor(() =>
      expect(fetchJsonMock.mock.calls.some(([url]) => url === "/api/chat")).toBe(true),
    );

    const callsBefore = fetchJsonMock.mock.calls.filter(([url]) => url === "/api/chat").length;
    await vi.advanceTimersByTimeAsync(10_000);
    const callsAfter = fetchJsonMock.mock.calls.filter(([url]) => url === "/api/chat").length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });
});
