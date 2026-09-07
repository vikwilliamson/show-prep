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

// jsdom doesn't implement scrollIntoView (no layout engine to scroll
// against). A no-op stub is enough for pages that call it as a side effect,
// like ChatPage auto-scrolling to the latest message.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
