// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { DraftsBadge } from "./nav-drafts";

overwriteGetLocale(() => "en");

test("renders the count when greater than zero", () => {
  render(<DraftsBadge count={5} />);
  expect(screen.getByText("5")).toBeTruthy();
});

test("renders nothing when count is zero", () => {
  const { container } = render(<DraftsBadge count={0} />);
  expect(container.firstChild).toBeNull();
});

test("renders nothing when count is undefined", () => {
  const { container } = render(<DraftsBadge count={undefined} />);
  expect(container.firstChild).toBeNull();
});
