// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientSettingsFields } from "@/components/ClientSettingsFields";

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

describe("ClientSettingsFields", () => {
  it("prefills every settings and weekly-target field", () => {
    render(
      <ClientSettingsFields
        settings={SETTINGS}
        targets={TARGETS}
        onSettingsChange={vi.fn()}
        onTargetsChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Target date")).toHaveValue("2027-03-01");
    expect(screen.getByLabelText("Target weight (lbs)")).toHaveValue(170);
    expect(screen.getByLabelText("Calories (kcal/day)")).toHaveValue(2000);
    expect(screen.getByLabelText("Protein (g/day)")).toHaveValue(180);
    expect(screen.getByLabelText("Water minimum (ml/day)")).toHaveValue(3000);
  });

  it("reports edits as a full updated settings / targets object", async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    const onTargetsChange = vi.fn();
    render(
      <ClientSettingsFields
        settings={SETTINGS}
        targets={TARGETS}
        onSettingsChange={onSettingsChange}
        onTargetsChange={onTargetsChange}
      />,
    );

    await user.type(screen.getByLabelText("Fat (g/day)"), "5");
    expect(onSettingsChange).toHaveBeenLastCalledWith({ ...SETTINGS, targetFatG: 605 });

    await user.type(screen.getByLabelText("Sleep minimum (hours/night)"), "5");
    expect(onTargetsChange).toHaveBeenLastCalledWith({ ...TARGETS, sleepHoursMin: 75 });
  });
});
