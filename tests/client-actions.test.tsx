// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientActions } from "@/components/ClientActions";

const { fetchJsonMock, refreshMock, pushMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
  refreshMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/client-fetch", () => ({
  fetchJson: fetchJsonMock,
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock }),
}));

describe("ClientActions", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
    refreshMock.mockReset();
    pushMock.mockReset();
  });

  it("shows Edit and Delete buttons by default", () => {
    render(<ClientActions accountId={1} name="Jamie Client" email="jamie@example.com" />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("edits name/email and PATCHes the account", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockResolvedValueOnce({
      account: { name: "Renamed", email: "renamed@example.com" },
    });
    render(<ClientActions accountId={1} name="Jamie Client" email="jamie@example.com" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchJsonMock).toHaveBeenCalledWith(
      "/api/accounts/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed", email: "jamie@example.com" }),
      }),
    );
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("does not call the delete API until the client's exact name is typed", async () => {
    const user = userEvent.setup();
    render(<ClientActions accountId={1} name="Jamie Client" email="jamie@example.com" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirmButton = screen.getByRole("button", { name: "Delete permanently" });
    expect(confirmButton).toBeDisabled();

    const confirmInput = screen.getByRole("textbox");
    await user.type(confirmInput, "wrong name");
    expect(confirmButton).toBeDisabled();
    expect(fetchJsonMock).not.toHaveBeenCalled();

    await user.clear(confirmInput);
    await user.type(confirmInput, "Jamie Client");
    expect(confirmButton).toBeEnabled();
  });

  it("deletes the account once the exact name is confirmed", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockResolvedValueOnce({ ok: true });
    render(<ClientActions accountId={1} name="Jamie Client" email="jamie@example.com" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.type(screen.getByRole("textbox"), "Jamie Client");
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(fetchJsonMock).toHaveBeenCalledWith("/api/accounts/1", expect.objectContaining({ method: "DELETE" }));
    expect(pushMock).toHaveBeenCalledWith("/clients");
  });
});
