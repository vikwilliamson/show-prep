// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "@/components/MarkdownContent";

describe("MarkdownContent", () => {
  it("renders markdown syntax as actual DOM elements, not literal characters", () => {
    render(
      <MarkdownContent
        content={"## Heading\n\n- list item\n\n**bold text**"}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Heading" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("list item");
    expect(screen.getByText("bold text").tagName).toBe("STRONG");

    expect(screen.queryByText(/##/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*bold/)).not.toBeInTheDocument();
  });
});
