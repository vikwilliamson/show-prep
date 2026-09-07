// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeightChart } from "@/components/WeightChart";

describe("WeightChart", () => {
  it("shows an empty-state message when there's no weigh-in data", () => {
    render(<WeightChart series={[]} trend={[]} targetLbs={187} />);
    expect(
      screen.getByText("No weigh-ins yet — sync the companion app to see your trend."),
    ).toBeInTheDocument();
  });

  it("renders without throwing when given real data and a target", () => {
    const series = [
      { date: "2026-08-01", weightLbs: 190 },
      { date: "2026-08-02", weightLbs: 189.5 },
    ];
    const trend = [{ date: "2026-08-02", weightLbs: 189.8 }];
    const { container } = render(<WeightChart series={series} trend={trend} targetLbs={187} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });

  it("renders without throwing when targetLbs is null (domain math skips the target)", () => {
    const series = [{ date: "2026-08-01", weightLbs: 190 }];
    const { container } = render(<WeightChart series={series} trend={[]} targetLbs={null} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });

  it("renders without throwing across a month boundary (exercises the shared lib/dates tick formatter)", () => {
    const series = [
      { date: "2026-07-31", weightLbs: 190 },
      { date: "2026-08-01", weightLbs: 189.5 },
    ];
    const { container } = render(<WeightChart series={series} trend={[]} targetLbs={187} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });
});
