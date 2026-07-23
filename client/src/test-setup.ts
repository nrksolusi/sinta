import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom lacks ResizeObserver, which cmdk (the command/combobox primitive)
// touches on mount. Provide a no-op so combobox-based components render in
// tests without pulling in a browser environment.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// cmdk scrolls the active option into view; jsdom does not implement it.
// Guard on Element because node-environment tests run this setup too.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Unmount rendered trees between tests so DOM queries never match leftover
// nodes from a previous test in the same file.
afterEach(() => {
  cleanup();
});

// jsdom lacks window.matchMedia, which useIsMobile uses for the mobile
// breakpoint media query. Provide a stub that always returns not-matches
// (desktop) so components using the hook render without errors.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
