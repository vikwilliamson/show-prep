import { describe, expect, it, vi, afterEach } from "vitest";
import { errorMessage, fetchJson } from "@/lib/client-fetch";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchJson", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns the parsed body on a 2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { hello: "world" }));
    await expect(fetchJson("/api/whatever")).resolves.toEqual({ hello: "world" });
  });

  it("throws the server's structured error message on a non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(422, { error: "Invalid category: foo" }));
    await expect(fetchJson("/api/whatever")).rejects.toThrow("Invalid category: foo");
  });

  it("falls back to a friendly generic message when the error body has no usable `error` field", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    await expect(fetchJson("/api/whatever")).rejects.toThrow(/something went wrong/i);
  });

  it("falls back to a friendly generic message when the error body isn't JSON at all", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("<html>Internal Server Error</html>", { status: 500 }),
    );
    await expect(fetchJson("/api/whatever")).rejects.toThrow(/something went wrong/i);
  });

  it("passes init through to the underlying fetch call", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    global.fetch = mockFetch;
    await fetchJson("/api/whatever", { method: "POST", body: "x" });
    expect(mockFetch).toHaveBeenCalledWith("/api/whatever", { method: "POST", body: "x" });
  });
});

describe("errorMessage", () => {
  it("returns the message of a real Error", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("returns the fallback for a non-Error thrown value", () => {
    expect(errorMessage("some string", "fallback")).toBe("fallback");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
  });

  it("uses a default fallback when none is provided", () => {
    expect(errorMessage("boom")).toMatch(/something went wrong/i);
  });
});
