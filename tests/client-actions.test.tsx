// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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

const SETTINGS = {
  targetName: "Spring cut",
  targetDate: "2027-03-01",
  programType: "weight_loss",
  targetNote: null,
  targetWeightLbs: 170,
  heightInches: 70,
  targetCalories: 2000,
  targetProteinG: 180,
  targetCarbsG: 200,
  targetFatG: 60,
  timezone: "America/Los_Angeles",
};
const TARGETS = {
  waterMlMin: 3000,
  sleepHoursMin: 7,
  workoutsPerWeekMin: 3,
  cardioSessionsPerWeek: 2,
};

function renderActions() {
  return render(
    <ClientActions
      accountId={1}
      name="Jamie Client"
      email="jamie@example.com"
      settings={SETTINGS}
      targets={TARGETS}
    />,
  );
}

describe("ClientActions", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
    refreshMock.mockReset();
    pushMock.mockReset();
  });

  it("shows Edit and Delete buttons and read-only details by default — no form fields", () => {
    renderActions();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByText("jamie@example.com")).toBeInTheDocument();
    expect(screen.getByText("2027-03-01")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Target date")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Calories (kcal/day)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("reveals name, email, target and nutrition fields, prefilled, only after clicking Edit", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Jamie Client");
    expect(screen.getByLabelText("Email")).toHaveValue("jamie@example.com");
    expect(screen.getByLabelText("Target date")).toHaveValue("2027-03-01");
    expect(screen.getByLabelText("Target weight (lbs)")).toHaveValue(170);
    expect(screen.getByLabelText("Calories (kcal/day)")).toHaveValue(2000);
    expect(screen.getByLabelText("Water minimum (ml/day)")).toHaveValue(3000);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("saves name/email then settings, and immediately shows the new values read-only", async () => {
    const user = userEvent.setup();
    fetchJsonMock
      .mockResolvedValueOnce({ account: { name: "Renamed", email: "renamed@example.com" } })
      .mockResolvedValueOnce({
        settings: { ...SETTINGS, targetDate: "2027-06-15", targetCalories: 2200 },
        targets: TARGETS,
      });
    renderActions();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");
    const emailInput = screen.getByLabelText("Email");
    await user.clear(emailInput);
    await user.type(emailInput, "renamed@example.com");
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2027-06-15" } });
    const calories = screen.getByLabelText("Calories (kcal/day)");
    await user.clear(calories);
    await user.type(calories, "2200");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchJsonMock).toHaveBeenNthCalledWith(
      1,
      "/api/accounts/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed", email: "renamed@example.com" }),
      }),
    );
    expect(fetchJsonMock).toHaveBeenNthCalledWith(
      2,
      "/api/clients/1/settings",
      expect.objectContaining({ method: "PUT" }),
    );
    const putBody = JSON.parse(fetchJsonMock.mock.calls[1][1].body);
    expect(putBody.settings.targetDate).toBe("2027-06-15");
    expect(putBody.settings.targetCalories).toBe(2200);
    expect(putBody.targets.waterMlMin).toBe(3000);

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("renamed@example.com")).toBeInTheDocument();
    expect(screen.getByText("2027-06-15")).toBeInTheDocument();
    expect(screen.getByText(/2200 kcal/)).toBeInTheDocument();
    expect(screen.queryByText("2027-03-01")).not.toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("Cancel discards edits and returns to the original read-only details", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const calories = screen.getByLabelText("Calories (kcal/day)");
    await user.clear(calories);
    await user.type(calories, "1500");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(fetchJsonMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(/2000 kcal/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Calories (kcal/day)")).toHaveValue(2000);
  });

  it("stays in edit mode with the error and does not refresh when saving fails", async () => {
    const user = userEvent.setup();
    fetchJsonMock
      .mockResolvedValueOnce({ account: { name: "Jamie Client", email: "jamie@example.com" } })
      .mockRejectedValueOnce(new Error("Validation failed"));
    renderActions();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Validation failed")).toBeInTheDocument();
    expect(screen.getByLabelText("Target date")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("does not call the delete API until the client's exact name is typed", async () => {
    const user = userEvent.setup();
    renderActions();

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
    renderActions();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.type(screen.getByRole("textbox"), "Jamie Client");
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(fetchJsonMock).toHaveBeenCalledWith("/api/accounts/1", expect.objectContaining({ method: "DELETE" }));
    expect(pushMock).toHaveBeenCalledWith("/clients");
  });
});
