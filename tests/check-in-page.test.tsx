// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CheckInPage from "@/app/check-in/page";

// The previous/next week buttons used to reimplement addDays() as a private
// shiftWeek() helper (TECH_DEBT.md §4.8) — now they call lib/dates.ts's
// addDays() directly. Mock fetchJson at the seam so these tests can assert
// exactly which weekStart each click requests, without a real API/DB.
const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock("@/lib/client-fetch", () => ({
  fetchJson: fetchJsonMock,
  errorMessage: (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback),
}));

function checkinResponse(weekStart: string) {
  return { weekStart, checkIn: null, dataAnswers: {}, template: [] };
}

describe("CheckInPage week navigation", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("requests exactly 7 days earlier when clicking 'previous week'", async () => {
    fetchJsonMock.mockResolvedValueOnce(checkinResponse("2026-08-24"));
    render(<CheckInPage />);
    await waitFor(() => screen.getByText(/week of 2026-08-24/));

    fetchJsonMock.mockResolvedValueOnce(checkinResponse("2026-08-17"));
    await userEvent.click(screen.getByRole("button", { name: "← previous week" }));

    await waitFor(() => screen.getByText(/week of 2026-08-17/));
    expect(fetchJsonMock).toHaveBeenLastCalledWith("/api/checkins?weekStart=2026-08-17");
  });

  it("requests exactly 7 days later when clicking 'next week', across a month boundary", async () => {
    fetchJsonMock.mockResolvedValueOnce(checkinResponse("2026-08-31"));
    render(<CheckInPage />);
    await waitFor(() => screen.getByText(/week of 2026-08-31/));

    fetchJsonMock.mockResolvedValueOnce(checkinResponse("2026-09-07"));
    await userEvent.click(screen.getByRole("button", { name: "next week →" }));

    await waitFor(() => screen.getByText(/week of 2026-09-07/));
    expect(fetchJsonMock).toHaveBeenLastCalledWith("/api/checkins?weekStart=2026-09-07");
  });
});
