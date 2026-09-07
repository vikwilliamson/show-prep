// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const PENDING_PROTOCOL = {
  id: 2,
  documentId: 1,
  documentTitle: "Macro plan",
  status: "pending",
  effectiveFrom: "2026-09-01",
  calories: 2000,
  proteinG: 180,
  carbsG: 200,
  fatG: 60,
  cardioPlan: null,
  notes: null,
  extractedJson: null,
  confirmedAt: null,
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

describe("DocumentsPage upload form accessibility", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("gives every upload-form field an accessible name, not just a placeholder", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockImplementation((url: string) =>
      Promise.resolve(url === "/api/documents" ? [] : []),
    );
    render(<DocumentsPage />);

    await screen.findByLabelText("Document title");
    expect(screen.getByLabelText("Document category")).toBeInTheDocument();
    expect(screen.getByLabelText("Document file")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Paste text" }));
    expect(screen.getByLabelText("Document text")).toBeInTheDocument();
  });
});

describe("DocumentsPage mutation guards", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("disables Confirm/Reject on a pending row while the PATCH is in flight, so a rapid double-click only fires one request", async () => {
    const user = userEvent.setup();
    let resolvePatch!: (value: unknown) => void;
    const patchPromise = new Promise((resolve) => {
      resolvePatch = resolve;
    });

    fetchJsonMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/documents") return Promise.resolve([DOC]);
      if (url === "/api/protocols") return Promise.resolve([PENDING_PROTOCOL]);
      if (url === "/api/protocols/2" && init?.method === "PATCH") return patchPromise;
      throw new Error(`unexpected fetchJson call: ${url}`);
    });

    render(<DocumentsPage />);
    const confirmButton = await screen.findByRole("button", { name: "Confirm as active" });
    const rejectButton = screen.getByRole("button", { name: "Reject" });

    await user.click(confirmButton);

    // Guard disables both buttons on the row the moment the mutation starts.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    });
    expect(rejectButton).toBeDisabled();

    // Clicking either button again while busy must not fire a second PATCH.
    await user.click(screen.getByRole("button", { name: "Working…" }));
    await user.click(rejectButton);
    expect(
      fetchJsonMock.mock.calls.filter(
        ([url, init]) => url === "/api/protocols/2" && (init as RequestInit)?.method === "PATCH",
      ),
    ).toHaveLength(1);

    resolvePatch(undefined);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirm as active" })).not.toBeDisabled();
    });
  });

  it("disables reprocess/delete on a document row while the request is in flight, so a rapid double-click only fires one request", async () => {
    const user = userEvent.setup();
    let resolveReprocess!: (value: unknown) => void;
    const reprocessPromise = new Promise((resolve) => {
      resolveReprocess = resolve;
    });

    fetchJsonMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/documents") return Promise.resolve([DOC]);
      if (url === "/api/protocols") return Promise.resolve([]);
      if (url === "/api/documents/1/reprocess" && init?.method === "POST")
        return reprocessPromise;
      throw new Error(`unexpected fetchJson call: ${url}`);
    });

    render(<DocumentsPage />);
    const reprocessButton = await screen.findByRole("button", { name: "re-run AI" });
    const deleteButton = screen.getByRole("button", { name: "delete" });

    await user.click(reprocessButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "working…" })).toBeDisabled();
    });
    expect(deleteButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "working…" }));
    await user.click(deleteButton);
    expect(
      fetchJsonMock.mock.calls.filter(
        ([url, init]) =>
          url === "/api/documents/1/reprocess" && (init as RequestInit)?.method === "POST",
      ),
    ).toHaveLength(1);

    resolveReprocess({ ok: true });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "re-run AI" })).not.toBeDisabled();
    });
  });
});
