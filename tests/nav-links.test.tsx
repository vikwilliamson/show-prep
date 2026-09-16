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
    expect(screen.getByRole("link", { name: "Documents" })).toHaveClass(
      "bg-accent/15",
    );
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveClass(
      "bg-accent/15",
    );
  });

  it("sets aria-current=page on the active link only", () => {
    vi.mocked(usePathname).mockReturnValue("/documents");
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Documents" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("does not mark Dashboard active on a nested route", () => {
    vi.mocked(usePathname).mockReturnValue("/documents");
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass(
      "bg-accent/15",
    );
  });

  it("marks Dashboard active on an exact root match", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
      "bg-accent/15",
    );
  });

  it("marks Dashboard active when on the coach's client-list redirect target", () => {
    vi.mocked(usePathname).mockReturnValue("/clients");
    render(<NavLinks />);
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveClass("bg-accent/15");
    expect(dashboard).toHaveAttribute("aria-current", "page");
  });

  it("marks Dashboard active on a nested per-client dashboard route", () => {
    vi.mocked(usePathname).mockReturnValue("/clients/42");
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
      "bg-accent/15",
    );
  });

  it("never renders a Clients link — Dashboard covers the coach's client list", () => {
    vi.mocked(usePathname).mockReturnValue("/clients");
    render(<NavLinks />);
    expect(
      screen.queryByRole("link", { name: "Clients" }),
    ).not.toBeInTheDocument();
  });
});
