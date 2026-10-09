// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import LogPage from "@/app/log/page";

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock("@/lib/client-fetch", () => ({
  fetchJson: fetchJsonMock,
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

// A client session: GET /api/clients is coach-only and 403s.
function asClient() {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url === "/api/clients") throw new Error("Forbidden");
    return { ok: true, saved: ["weight"] };
  });
}

function asCoach() {
  fetchJsonMock.mockImplementation(async (url: string) => {
    if (url === "/api/clients") {
      return [
        { id: 7, name: "Jamie Client" },
        { id: 9, name: "Sam Client" },
      ];
    }
    return { ok: true, saved: ["weight"] };
  });
}

const postCalls = () =>
  fetchJsonMock.mock.calls.filter(([url]) => url === "/api/manual-entry");

describe("LogPage", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("gives every field an accessible label and shows no client selector to a client", async () => {
    asClient();
    render(<LogPage />);
    expect(await screen.findByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Weight (lbs)")).toBeInTheDocument();
    expect(screen.getByLabelText("Sleep (hours)")).toBeInTheDocument();
    expect(screen.getByLabelText("Water (ml)")).toBeInTheDocument();
    expect(screen.getByLabelText("Steps")).toBeInTheDocument();
    expect(screen.getByLabelText("Active calories")).toBeInTheDocument();
    expect(screen.getByLabelText("Total calories")).toBeInTheDocument();
    await waitFor(() => expect(fetchJsonMock).toHaveBeenCalledWith("/api/clients"));
    expect(screen.queryByLabelText("Client")).not.toBeInTheDocument();
  });

  it("disables Save until at least one measurement is filled in", async () => {
    const user = userEvent.setup();
    asClient();
    render(<LogPage />);
    const save = await screen.findByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Weight (lbs)"), "180");
    expect(save).toBeEnabled();
  });

  it("posts only the filled fields, then confirms and clears the measurements", async () => {
    const user = userEvent.setup();
    asClient();
    render(<LogPage />);

    fireEvent.change(await screen.findByLabelText("Date"), { target: { value: "2026-07-14" } });
    await user.type(screen.getByLabelText("Weight (lbs)"), "181.4");
    await user.type(screen.getByLabelText("Sleep (hours)"), "7.5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    const [, init] = postCalls()[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ date: "2026-07-14", weightLbs: 181.4, sleepHours: 7.5 });

    expect(await screen.findByText(/Saved/)).toBeInTheDocument();
    expect(screen.getByLabelText("Weight (lbs)")).toHaveValue(null);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-07-14");
  });

  it("shows the error and keeps the entered values when saving fails", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockImplementation(async (url: string) => {
      if (url === "/api/clients") throw new Error("Forbidden");
      throw new Error("Can't log data for a future date.");
    });
    render(<LogPage />);

    await user.type(await screen.findByLabelText("Water (ml)"), "2500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Can't log data for a future date.")).toBeInTheDocument();
    expect(screen.getByLabelText("Water (ml)")).toHaveValue(2500);
  });

  it("makes a coach pick a client first, then posts that client's accountId", async () => {
    const user = userEvent.setup();
    asCoach();
    render(<LogPage />);

    const select = await screen.findByLabelText("Client");
    await user.type(screen.getByLabelText("Weight (lbs)"), "170");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.selectOptions(select, "7");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(JSON.parse(postCalls()[0][1].body)).toMatchObject({ accountId: 7, weightLbs: 170 });
  });
});
