// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("LoginPage accessibility", () => {
  it("gives the passcode field an accessible name, not just a placeholder", async () => {
    const { default: LoginPage } = await import("@/app/login/page");
    render(<LoginPage />);
    expect(screen.getByLabelText("Passcode")).toBeInTheDocument();
  });
});

describe("LoginPage demo flow removal (VIK-132)", () => {
  it("shows only the passcode field, no demo card, when NEXT_PUBLIC_DEMO_PASSWORD is unset", async () => {
    const { default: LoginPage } = await import("@/app/login/page");
    render(<LoginPage />);
    expect(screen.queryByText("Portfolio demo")).not.toBeInTheDocument();
    expect(screen.queryByText(/Enter demo/)).not.toBeInTheDocument();
  });

  it("still shows no demo card even if NEXT_PUBLIC_DEMO_PASSWORD is set — the passcode field is the only login path now", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_PASSWORD", "some-legacy-value");
    vi.resetModules();
    const { default: LoginPage } = await import("@/app/login/page");
    render(<LoginPage />);
    expect(screen.queryByText("Portfolio demo")).not.toBeInTheDocument();
    expect(screen.queryByText(/Enter demo/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Passcode")).toBeInTheDocument();
  });
});

describe("LoginPage result feedback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function submitPasscode(response: { ok: boolean }) {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const { default: LoginPage } = await import("@/app/login/page");
    render(<LoginPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Passcode"), "secret");
    await user.click(screen.getByRole("button", { name: "Enter" }));
    return assign;
  }

  it("shows 'Wrong passcode.' and does not navigate when the passcode is rejected", async () => {
    const assign = await submitPasscode({ ok: false });
    expect(await screen.findByText("Wrong passcode.")).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows 'Login successful.' in the same spot when the passcode is accepted", async () => {
    await submitPasscode({ ok: true });
    expect(await screen.findByText("Login successful.")).toBeInTheDocument();
    expect(screen.queryByText("Wrong passcode.")).not.toBeInTheDocument();
  });

  it("then does a full-page navigation to '/', so a stale prefetched redirect can't strand the user on /login", async () => {
    const assign = await submitPasscode({ ok: true });
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("keeps the Enter button disabled after success so the form can't be re-submitted mid-redirect", async () => {
    await submitPasscode({ ok: true });
    await screen.findByText("Login successful.");
    expect(screen.getByRole("button", { name: "Enter" })).toBeDisabled();
  });

  it("shows an error and re-enables the form when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { default: LoginPage } = await import("@/app/login/page");
    render(<LoginPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Passcode"), "secret");
    await user.click(screen.getByRole("button", { name: "Enter" }));
    expect(await screen.findByText("Couldn't reach the server. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter" })).not.toBeDisabled();
  });
});
