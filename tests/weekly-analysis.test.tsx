// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeeklyAnalysis } from "@/components/WeeklyAnalysis";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("WeeklyAnalysis", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a placeholder and 'Generate analysis' when there's no analysis yet", () => {
    render(<WeeklyAnalysis weekStart="2026-08-31" initialAnalysis={null} />);
    expect(screen.getByText("No analysis yet for the week of 2026-08-31.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate analysis" })).toBeInTheDocument();
  });

  it("shows the existing analysis and 'Regenerate analysis' when one already exists", () => {
    render(<WeeklyAnalysis weekStart="2026-08-31" initialAnalysis="Great week overall." />);
    expect(screen.getByText("Great week overall.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate analysis" })).toBeInTheDocument();
  });

  it("shows a busy, disabled state while generating, then displays the new analysis", async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    render(<WeeklyAnalysis weekStart="2026-08-31" initialAnalysis={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate analysis" }));

    expect(screen.getByRole("button", { name: "Writing analysis…" })).toBeDisabled();

    resolveFetch(jsonResponse(200, { analysis: "New analysis text." }));
    await waitFor(() => expect(screen.getByText("New analysis text.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Regenerate analysis" })).toBeEnabled();
  });

  it("shows a friendly error message when generation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
    render(<WeeklyAnalysis weekStart="2026-08-31" initialAnalysis={null} />);

    await userEvent.click(screen.getByRole("button", { name: "Generate analysis" }));

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Generate analysis" })).toBeEnabled();
  });
});
