// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("LoginPage accessibility", () => {
  it("gives the passcode field an accessible name, not just a placeholder", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("Passcode")).toBeInTheDocument();
  });
});
