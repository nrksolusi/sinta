import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered trees between tests so DOM queries never match leftover
// nodes from a previous test in the same file.
afterEach(() => {
  cleanup();
});
