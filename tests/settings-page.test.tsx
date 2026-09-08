// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/settings/page";

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock("@/lib/client-fetch", () => ({
  fetchJson: fetchJsonMock,
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

const SETTINGS_RESPONSE = {
  settings: {
    targetName: "Spring cut",
    targetDate: null,
    programType: "fat_loss",
    targetNote: null,
    targetWeightLbs: null,
    heightInches: null,
    targetCalories: 2000,
    targetProteinG: 180,
    targetCarbsG: 200,
    targetFatG: 60,
    timezone: "America/Los_Angeles",
  },
  targets: {
    waterMlMin: 3000,
    sleepHoursMin: 7,
    workoutsPerWeekMin: 3,
    cardioSessionsPerWeek: 2,
  },
  referenceId: "ref-123",
  role: "client",
};

describe("SettingsPage accessibility", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("gives the read-only pairing ID field an accessible name", async () => {
    fetchJsonMock.mockResolvedValueOnce(SETTINGS_RESPONSE);
    render(<SettingsPage />);
    expect(await screen.findByLabelText("Companion pairing ID")).toBeInTheDocument();
  });

  it("gives the revealed client passcode field an accessible name", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockResolvedValueOnce({ ...SETTINGS_RESPONSE, role: "coach" });
    render(<SettingsPage />);

    const nameInput = await screen.findByLabelText("Client name");
    await user.type(nameInput, "New Client");

    fetchJsonMock.mockResolvedValueOnce({
      account: { name: "New Client", referenceId: "new-client-ref-id" },
      passcode: "abc123",
    });
    await user.click(screen.getByRole("button", { name: "Add client" }));

    expect(await screen.findByLabelText("New client passcode")).toBeInTheDocument();
  });

  it("gives the client email field an accessible name", async () => {
    fetchJsonMock.mockResolvedValueOnce({ ...SETTINGS_RESPONSE, role: "coach" });
    render(<SettingsPage />);
    expect(await screen.findByLabelText("Client email (optional)")).toBeInTheDocument();
  });

  it("shows the new client's pairing ID alongside their passcode, both copyable", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockResolvedValueOnce({ ...SETTINGS_RESPONSE, role: "coach" });
    render(<SettingsPage />);

    const nameInput = await screen.findByLabelText("Client name");
    await user.type(nameInput, "New Client");

    fetchJsonMock.mockResolvedValueOnce({
      account: { name: "New Client", referenceId: "new-client-ref-id" },
      passcode: "abc123",
    });
    await user.click(screen.getByRole("button", { name: "Add client" }));

    const pairingIdField = await screen.findByLabelText("New client pairing ID");
    expect(pairingIdField).toHaveValue("new-client-ref-id");
  });
});

describe("SettingsPage save guard", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("disables Save settings while the PUT is in flight, so a rapid double-submit only fires one request", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockResolvedValueOnce(SETTINGS_RESPONSE);
    render(<SettingsPage />);

    const saveButton = await screen.findByRole("button", { name: "Save settings" });

    let resolvePut!: (value: unknown) => void;
    const putPromise = new Promise((resolve) => {
      resolvePut = resolve;
    });
    fetchJsonMock.mockReturnValueOnce(putPromise);

    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: "Saving…" }));
    expect(
      fetchJsonMock.mock.calls.filter(
        ([url, init]) => url === "/api/settings" && (init as RequestInit)?.method === "PUT",
      ),
    ).toHaveLength(1);

    resolvePut(SETTINGS_RESPONSE);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save settings" })).not.toBeDisabled();
    });
  });
});
