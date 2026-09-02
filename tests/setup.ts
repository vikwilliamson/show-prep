import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// RTL doesn't unmount between tests on its own outside of a globals setup.
afterEach(() => {
  cleanup();
});

// Recharts' ResponsiveContainer uses ResizeObserver, which jsdom doesn't
// implement. A no-op stub is enough — chart tests don't depend on resize
// behavior, just on rendering without throwing.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
