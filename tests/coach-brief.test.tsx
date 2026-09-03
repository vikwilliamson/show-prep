// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachBrief } from "@/components/CoachBrief";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CoachBrief", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a placeholder, 'Generate brief', a disabled Approve button, and no AiBadge when there's no brief yet", () => {
    render(<CoachBrief accountId={1} weekStart="2026-08-31" initialBrief={null} />);
    expect(screen.getByText("No brief yet for the week of 2026-08-31.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.queryByText("AI-assisted")).not.toBeInTheDocument();
  });

  it("shows the existing draft in an editable textarea, 'Regenerate brief', an enabled Approve button, and the AiBadge", () => {
    render(
      <CoachBrief
        accountId={1}
        weekStart="2026-08-31"
        initialBrief={{ status: "draft", content: "Solid week overall.", approvedAt: null }}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Solid week overall.");
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByText("AI-assisted")).toBeInTheDocument();
  });

  it("shows 'Approved {date}' and a disabled Approve control once already approved, but keeps the textarea editable", () => {
    render(
      <CoachBrief
        accountId={1}
        weekStart="2026-08-31"
        initialBrief={{
          status: "approved",
          content: "Solid week overall.",
          approvedAt: "2026-09-01T12:00:00.000Z",
        }}
      />,
    );
    const approveButton = screen.getByRole("button", { name: /Approved/ });
    expect(approveButton).toHaveTextContent("Approved 2026-09-01");
    expect(approveButton).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeEnabled();
  });

  it("generates a draft, showing a busy state, then displays the new content and badge", async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    render(<CoachBrief accountId={1} weekStart="2026-08-31" initialBrief={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate brief" }));

    expect(screen.getByRole("button", { name: "Writing brief…" })).toBeDisabled();

    resolveFetch(jsonResponse(200, { status: "draft", content: "New draft text.", approvedAt: null }));
    await waitFor(() => expect(screen.getByText("New draft text.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeEnabled();
    expect(screen.getByText("AI-assisted")).toBeInTheDocument();
  });

  it("lets the coach edit the textarea and save without approving", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { status: "draft", content: "Edited content.", approvedAt: null }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CoachBrief
        accountId={1}
        weekStart="2026-08-31"
        initialBrief={{ status: "draft", content: "Original content.", approvedAt: null }}
      />,
    );

    const textarea = screen.getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Edited content.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/clients/1/brief");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      weekStart: "2026-08-31",
      content: "Edited content.",
      approve: false,
    });
  });

  it("approves the current draft content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        status: "approved",
        content: "Solid week overall.",
        approvedAt: "2026-09-01T12:00:00.000Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CoachBrief
        accountId={1}
        weekStart="2026-08-31"
        initialBrief={{ status: "draft", content: "Solid week overall.", approvedAt: null }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Approved/ })).toHaveTextContent("Approved 2026-09-01"),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      weekStart: "2026-08-31",
      content: "Solid week overall.",
      approve: true,
    });
  });

  it("shows a friendly error message when generation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
    render(<CoachBrief accountId={1} weekStart="2026-08-31" initialBrief={null} />);

    await userEvent.click(screen.getByRole("button", { name: "Generate brief" }));

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled();
  });
});
