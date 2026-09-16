// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-sans" }),
  Geist_Mono: () => ({ variable: "font-mono" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  it("renders the header nav with no session/cookie lookup", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    // RootLayout returns <html><body>...</body></html> — mount just the
    // body's children so RTL isn't asked to render document structure into
    // its own container div.
    const element = RootLayout({ children: <div>page content</div> });
    const body = (element as { props: { children: React.ReactElement } })
      .props.children;
    render(body);

    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
