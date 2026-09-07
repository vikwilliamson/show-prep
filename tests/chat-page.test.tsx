// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatPage from "@/app/chat/page";

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock("@/lib/client-fetch", () => ({
  fetchJson: fetchJsonMock,
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

async function renderReady() {
  fetchJsonMock.mockResolvedValueOnce([]);
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
      user: { id: 1, role: "user", content: "Hello", sources: null },
      assistant: { id: 2, role: "assistant", content: "Hi!", sources: null },
    });
    // Once the request settles, the real assistant reply replaces the
    // optimistic bubble — confirming the guard released rather than the
    // page getting stuck disabled forever.
    await screen.findByText("Hi!");
  });
});
