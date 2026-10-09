// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientActions } from "@/components/ClientActions";
import { ClientEditModeProvider, HideWhileEditing } from "@/components/ClientEditMode";

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock("@/lib/client-fetch", () => ({
  fetchJson: fetchJsonMock,
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const SETTINGS = {
  targetName: null,
  targetDate: null,
  programType: "weight_loss",
  targetNote: null,
  targetWeightLbs: null,
  heightInches: null,
  targetCalories: null,
  targetProteinG: null,
  targetCarbsG: null,
  targetFatG: null,
  timezone: "America/Los_Angeles",
};
const TARGETS = { waterMlMin: 3000, sleepHoursMin: 7, workoutsPerWeekMin: 3, cardioSessionsPerWeek: 0 };

function renderPage() {
  return render(
    <ClientEditModeProvider>
      <ClientActions
        accountId={1}
        name="Jamie Client"
        email={null}
        settings={SETTINGS}
        targets={TARGETS}
      />
      <HideWhileEditing>
        <p>Bodyweight chart</p>
      </HideWhileEditing>
    </ClientEditModeProvider>,
  );
}

describe("HideWhileEditing", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("shows its children while the client page is in view mode", () => {
    renderPage();
    expect(screen.getByText("Bodyweight chart")).toBeInTheDocument();
  });

  it("hides its children as soon as Edit is clicked and restores them on Cancel", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByText("Bodyweight chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Bodyweight chart")).toBeInTheDocument();
  });

  it("restores its children after a successful save", async () => {
    const user = userEvent.setup();
    fetchJsonMock
      .mockResolvedValueOnce({ account: { name: "Jamie Client", email: null } })
      .mockResolvedValueOnce({ settings: SETTINGS, targets: TARGETS });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByText("Bodyweight chart")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Bodyweight chart")).toBeInTheDocument();
  });

  it("keeps its children hidden when a save fails and the form stays open", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockResolvedValueOnce({ account: { name: "Jamie Client", email: null } });
    fetchJsonMock.mockRejectedValueOnce(new Error("Validation failed"));
    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Validation failed")).toBeInTheDocument();
    expect(screen.queryByText("Bodyweight chart")).not.toBeInTheDocument();
  });

  it("ClientActions still works with no provider around it", async () => {
    const user = userEvent.setup();
    render(
      <ClientActions
        accountId={1}
        name="Jamie Client"
        email={null}
        settings={SETTINGS}
        targets={TARGETS}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });
});
