// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiBadge } from "@/components/AiBadge";

describe("AiBadge", () => {
  it("renders the AI-assisted label", () => {
    render(<AiBadge detail="Grounded in this week's synced data." />);
    expect(screen.getByText("AI-assisted")).toBeInTheDocument();
  });

  it("uses the given detail as the tooltip, not a generic string", () => {
    render(<AiBadge detail="Grounded in your uploaded documents, with sources cited below." />);
    expect(screen.getByText("AI-assisted")).toHaveAttribute(
      "title",
      "Grounded in your uploaded documents, with sources cited below.",
    );
  });

  it("reflects a different detail per call site rather than one shared default", () => {
    const { rerender } = render(<AiBadge detail="First surface's detail." />);
    expect(screen.getByText("AI-assisted")).toHaveAttribute("title", "First surface's detail.");

    rerender(<AiBadge detail="Second surface's detail." />);
    expect(screen.getByText("AI-assisted")).toHaveAttribute("title", "Second surface's detail.");
  });

  it("accepts an additional className", () => {
    render(<AiBadge detail="Grounded in this week's synced data." className="mt-2" />);
    expect(screen.getByText("AI-assisted")).toHaveClass("mt-2");
  });
});
