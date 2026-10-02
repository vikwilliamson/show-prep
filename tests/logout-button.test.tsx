// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { usePathname, useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "@/components/LogoutButton";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

const push = vi.fn();
const refresh = vi.fn();

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.mocked(useRouter).mockReturnValue({ push, refresh } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(usePathname).mockReturnValue("/");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

describe("LogoutButton", () => {
  it("DELETEs /api/session then routes to /login", async () => {
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(fetch).toHaveBeenCalledWith("/api/session", { method: "DELETE" });
    expect(refresh).toHaveBeenCalled();
  });

  it("stays put and shows an error if the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t log out/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("renders nothing on the login page", () => {
    vi.mocked(usePathname).mockReturnValue("/login");
    render(<LogoutButton />);
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });
});
