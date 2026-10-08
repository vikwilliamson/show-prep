// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientSettingsForm } from "@/components/ClientSettingsForm";

const { fetchJsonMock, refreshMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("@/lib/client-fetch", () => ({
  fetchJson: fetchJsonMock,
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
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

describe("ClientSettingsForm", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
    refreshMock.mockReset();
  });

  it("prefills the client's target date, target weight, and nutrition targets", () => {
    render(<ClientSettingsForm accountId={7} settings={SETTINGS} targets={TARGETS} />);
    expect(screen.getByLabelText("Target date")).toHaveValue("2027-03-01");
    expect(screen.getByLabelText("Target weight (lbs)")).toHaveValue(170);
    expect(screen.getByLabelText("Calories (kcal/day)")).toHaveValue(2000);
    expect(screen.getByLabelText("Protein (g/day)")).toHaveValue(180);
    expect(screen.getByLabelText("Carbs (g/day)")).toHaveValue(200);
    expect(screen.getByLabelText("Fat (g/day)")).toHaveValue(60);
    expect(screen.getByLabelText("Water minimum (ml/day)")).toHaveValue(3000);
  });

  it("PUTs edits to that client's settings route, then refreshes the page data", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockResolvedValueOnce({
      settings: { ...SETTINGS, targetCalories: 2200 },
      targets: TARGETS,
    });
    render(<ClientSettingsForm accountId={7} settings={SETTINGS} targets={TARGETS} />);

    const calories = screen.getByLabelText("Calories (kcal/day)");
    await user.clear(calories);
    await user.type(calories, "2200");
    await user.click(screen.getByRole("button", { name: "Save client settings" }));

    expect(fetchJsonMock).toHaveBeenCalledWith(
      "/api/clients/7/settings",
      expect.objectContaining({ method: "PUT" }),
    );
    const body = JSON.parse(fetchJsonMock.mock.calls[0][1].body);
    expect(body.settings.targetCalories).toBe(2200);
    expect(body.settings.targetDate).toBe("2027-03-01");
    expect(body.targets.waterMlMin).toBe(3000);
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows the error and does not refresh when saving fails", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockRejectedValueOnce(new Error("Validation failed"));
    render(<ClientSettingsForm accountId={7} settings={SETTINGS} targets={TARGETS} />);

    await user.click(screen.getByRole("button", { name: "Save client settings" }));

    expect(await screen.findByText("Validation failed")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("disables saving until a program type is chosen", () => {
    render(
      <ClientSettingsForm
        accountId={7}
        settings={{ ...SETTINGS, programType: null }}
        targets={TARGETS}
      />,
    );
    expect(screen.getByRole("button", { name: "Save client settings" })).toBeDisabled();
  });
});
