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

const CLIENTS = [
  { id: 10, name: "Alex Client", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: 11, name: "Sam Client", createdAt: "2026-01-02T00:00:00.000Z" },
];

describe("DocumentsPage coach client-selector", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("does not render a client selector for a client session (GET /api/clients 403s)", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/documents") return Promise.resolve([DOC]);
      if (url === "/api/protocols") return Promise.resolve([]);
      if (url === "/api/clients") return Promise.reject(new Error("Forbidden"));
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<DocumentsPage />);

    await screen.findByText(/Library/);
    expect(screen.queryByLabelText("Client")).not.toBeInTheDocument();
  });

  it("renders a client selector for a coach session, sourced from GET /api/clients", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/documents") return Promise.resolve([DOC]);
      if (url === "/api/protocols") return Promise.resolve([]);
      if (url === "/api/clients") return Promise.resolve(CLIENTS);
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<DocumentsPage />);

    const select = await screen.findByLabelText("Client");
    expect(screen.getByRole("option", { name: "Alex Client" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sam Client" })).toBeInTheDocument();
    expect(select).toHaveValue("");
  });

  it("defaults to the coach's own account: no accountId param on initial load", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/documents") return Promise.resolve([DOC]);
      if (url === "/api/protocols") return Promise.resolve([]);
      if (url === "/api/clients") return Promise.resolve(CLIENTS);
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<DocumentsPage />);

    await screen.findByLabelText("Client");
    expect(fetchJsonMock.mock.calls.some(([url]) => url === "/api/documents")).toBe(true);
    expect(fetchJsonMock.mock.calls.some(([url]) => String(url).includes("accountId"))).toBe(
      false,
    );
  });

  it("selecting a client re-scopes the Library and Protocol history fetches together", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockImplementation((url: string) => {
      if (url === "/api/documents" || url === "/api/documents?accountId=10")
        return Promise.resolve([DOC]);
      if (url === "/api/protocols" || url === "/api/protocols?accountId=10")
        return Promise.resolve([]);
      if (url === "/api/clients") return Promise.resolve(CLIENTS);
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<DocumentsPage />);

    const select = await screen.findByLabelText("Client");
    fetchJsonMock.mockClear();
    await user.selectOptions(select, "10");

    await waitFor(() => {
      expect(fetchJsonMock.mock.calls.some(([url]) => url === "/api/documents?accountId=10")).toBe(
        true,
      );
    });
    expect(fetchJsonMock.mock.calls.some(([url]) => url === "/api/protocols?accountId=10")).toBe(
      true,
    );
  });

  it("includes the selected client's accountId as an upload form field", async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/documents" || url === "/api/documents?accountId=10")
        return Promise.resolve([]);
      if (url === "/api/protocols" || url === "/api/protocols?accountId=10")
        return Promise.resolve([]);
      if (url === "/api/clients") return Promise.resolve(CLIENTS);
      if (url === "/api/documents" && init?.method === "POST") {
        return Promise.resolve({ document: { title: "t" }, protocols: [], warnings: [] });
      }
      throw new Error(`unexpected fetchJson call: ${url}`);
    });
    render(<DocumentsPage />);

    const select = await screen.findByLabelText("Client");
    await user.selectOptions(select, "10");
    await user.click(screen.getByRole("button", { name: "Paste text" }));
    await user.type(screen.getByLabelText("Document text"), "some notes");

    fetchJsonMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/documents" && init?.method === "POST") {
        const form = init.body as FormData;
        expect(form.get("accountId")).toBe("10");
        return Promise.resolve({ document: { title: "t" }, protocols: [], warnings: [] });
      }
      return Promise.resolve([]);
    });
    await user.click(screen.getByRole("button", { name: "Upload & extract" }));
  });
});

describe("DocumentsPage AI transparency badge", () => {
  afterEach(() => {
    fetchJsonMock.mockReset();
  });

  it("shows the AI-assisted badge on a pending extraction row", async () => {
    fetchJsonMock.mockImplementation((url: string) =>
      Promise.resolve(url === "/api/documents" ? [DOC] : [PENDING_PROTOCOL]),
    );
    render(<DocumentsPage />);
    await screen.findByText("AI-assisted");
  });

  it("shows no badge on a confirmed history row", async () => {
    fetchJsonMock.mockImplementation((url: string) =>
      Promise.resolve(url === "/api/documents" ? [DOC] : [HISTORY_PROTOCOL]),
    );
    render(<DocumentsPage />);
    await screen.findAllByRole("table");
    expect(screen.queryByText("AI-assisted")).not.toBeInTheDocument();
  });
});
