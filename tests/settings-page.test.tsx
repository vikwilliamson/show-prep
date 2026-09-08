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

describe("SettingsPage onboarding email", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  async function addClientWithEmail(email: string | null) {
    const user = userEvent.setup();
    fetchJsonMock.mockResolvedValueOnce({ ...SETTINGS_RESPONSE, role: "coach" });
    render(<SettingsPage />);

    await user.type(await screen.findByLabelText("Client name"), "New Client");
    if (email) {
      await user.type(screen.getByLabelText("Client email (optional)"), email);
    }

    fetchJsonMock.mockResolvedValueOnce({
      account: { id: 42, name: "New Client", email, referenceId: "new-client-ref-id" },
      passcode: "abc123",
    });
    await user.click(screen.getByRole("button", { name: "Add client" }));
    await screen.findByLabelText("New client pairing ID");
    return user;
  }

  it("shows a 'Send onboarding email' button once a client with an email is created", async () => {
    await addClientWithEmail("client@example.com");
    expect(screen.getByRole("button", { name: "Send onboarding email" })).toBeInTheDocument();
  });

  it("omits the button and shows a hint when the new client has no email", async () => {
    await addClientWithEmail(null);
    expect(screen.queryByRole("button", { name: "Send onboarding email" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Add an email address above to send an onboarding email."),
    ).toBeInTheDocument();
  });

  it("posts the account id and passcode, then shows a confirmation", async () => {
    const user = await addClientWithEmail("client@example.com");

    fetchJsonMock.mockResolvedValueOnce({ ok: true });
    await user.click(screen.getByRole("button", { name: "Send onboarding email" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "/api/accounts/42/onboarding-email",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ passcode: "abc123" }),
        }),
      );
    });
    expect(
      await screen.findByText("Onboarding email sent to client@example.com."),
    ).toBeInTheDocument();
  });

  it("shows an error message when sending fails", async () => {
    const user = await addClientWithEmail("client@example.com");

    fetchJsonMock.mockRejectedValueOnce(new Error("Email isn't configured (missing RESEND_API_KEY)."));
    await user.click(screen.getByRole("button", { name: "Send onboarding email" }));

    expect(
      await screen.findByText("Email isn't configured (missing RESEND_API_KEY)."),
    ).toBeInTheDocument();
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
