// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComplianceChart } from "@/components/ComplianceChart";

describe("ComplianceChart", () => {
  it("shows an empty-state message when no meals were logged", () => {
    render(<ComplianceChart days={[]} targets={null} />);
    expect(screen.getByText("No meals logged in the last 14 days.")).toBeInTheDocument();
  });

  it("renders without throwing when given real data and targets", () => {
    const days = [
      { date: "2026-08-01", calories: 2100, proteinG: 200, carbsG: 180, fatG: 60 },
      { date: "2026-08-02", calories: 2050, proteinG: 195, carbsG: 175, fatG: 58 },
    ];
    const targets = { calories: 2100, proteinG: 210, carbsG: 185, fatG: 55 };
    const { container } = render(<ComplianceChart days={days} targets={targets} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });

  it("renders without throwing when targets is null", () => {
    const days = [{ date: "2026-08-01", calories: 2100, proteinG: 200, carbsG: 180, fatG: 60 }];
    const { container } = render(<ComplianceChart days={days} targets={null} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });
});
