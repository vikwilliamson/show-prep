// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoachBriefCard } from "@/components/CoachBriefCard";

describe("CoachBriefCard", () => {
  it("renders nothing when there's no brief for the week", () => {
    const { container } = render(<CoachBriefCard brief={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the brief is still a draft", () => {
    const { container } = render(
      <CoachBriefCard brief={{ status: "draft", content: "Solid week overall." }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the title, content, and AiBadge once the brief is approved", () => {
    render(<CoachBriefCard brief={{ status: "approved", content: "Solid week overall." }} />);
    expect(screen.getByText("This week from your coach")).toBeInTheDocument();
    expect(screen.getByText("Solid week overall.")).toBeInTheDocument();
    expect(screen.getByText("AI-assisted")).toBeInTheDocument();
  });

  it("has no edit controls — this is read-only for the client", () => {
    render(<CoachBriefCard brief={{ status: "approved", content: "Solid week overall." }} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
