// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocumentsPage from "@/app/documents/page";

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock("@/lib/client-fetch", () => ({
  fetchJson: fetchJsonMock,
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

const DOC = {
  id: 1,
  title: "Macro plan",
  category: "coach_protocol",
  sourceType: "pdf",
  originalFilename: "plan.pdf",
  uploadedAt: "2026-09-01T00:00:00.000Z",
  embeddedAt: null,
  chunkCount: 3,
};

const HISTORY_PROTOCOL = {
  id: 1,
  documentId: 1,
  documentTitle: "Macro plan",
  status: "active",
  effectiveFrom: "2026-09-01",
  calories: 2000,
  proteinG: 180,
  carbsG: 200,
  fatG: 60,
  cardioPlan: null,
  notes: null,
  extractedJson: null,
  confirmedAt: "2026-09-01T00:00:00.000Z",
};

describe("DocumentsPage tables", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("wraps the library and protocol-history tables in a horizontal-scroll container", async () => {
    fetchJsonMock.mockImplementation((url: string) =>
      Promise.resolve(url === "/api/documents" ? [DOC] : [HISTORY_PROTOCOL]),
    );
    render(<DocumentsPage />);

    const tables = await screen.findAllByRole("table");
    expect(tables).toHaveLength(2);
    for (const table of tables) {
      expect(table.parentElement).toHaveClass("overflow-x-auto");
    }
  });
});
