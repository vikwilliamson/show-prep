// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { NavLinks } from "@/components/NavLinks";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("NavLinks", () => {
  it("marks the current route's link active and leaves others inactive", () => {
    vi.mocked(usePathname).mockReturnValue("/documents");
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Documents" })).toHaveClass("bg-accent/15");
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveClass("bg-accent/15");
  });

  it("does not mark Dashboard active on a nested route", () => {
    vi.mocked(usePathname).mockReturnValue("/documents");
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass("bg-accent/15");
  });

  it("marks Dashboard active only on an exact match", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass("bg-accent/15");
  });

  it("inserts the Clients link right after Dashboard when isCoach is true", () => {
    vi.mocked(usePathname).mockReturnValue("/clients");
    render(<NavLinks isCoach />);
    const links = screen.getAllByRole("link").map((el) => el.textContent);
    expect(links).toEqual([
      "Dashboard",
      "Clients",
      "Documents",
      "Check-In",
      "Doc Chat",
      "Settings",
    ]);
  });

  it("omits the Clients link when isCoach is false", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    render(<NavLinks />);
    expect(screen.queryByRole("link", { name: "Clients" })).not.toBeInTheDocument();
  });
});
