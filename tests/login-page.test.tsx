// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
