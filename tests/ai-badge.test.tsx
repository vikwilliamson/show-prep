// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiBadge } from "@/components/AiBadge";

describe("AiBadge", () => {
  it("renders the AI-assisted label", () => {
    render(<AiBadge />);
    expect(screen.getByText("AI-assisted")).toBeInTheDocument();
  });

  it("carries an explanatory title tooltip", () => {
    render(<AiBadge />);
    expect(screen.getByText("AI-assisted")).toHaveAttribute(
      "title",
      "Drafted by AI — review before relying on it.",
    );
  });

  it("accepts an additional className", () => {
    render(<AiBadge className="mt-2" />);
    expect(screen.getByText("AI-assisted")).toHaveClass("mt-2");
  });
});
