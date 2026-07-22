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
