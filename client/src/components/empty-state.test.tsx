// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { EmptyState } from "./empty-state";

overwriteGetLocale(() => "en");

test("renders title and description", () => {
  render(
    <EmptyState
      variant="first-use"
      title="No documents yet"
      description="Documents you create appear here."
    />,
  );
  expect(screen.getByText("No documents yet")).toBeTruthy();
  expect(screen.getByText("Documents you create appear here.")).toBeTruthy();
});

test("renders the action when provided", () => {
  render(
    <EmptyState
      variant="first-use"
      title="No documents yet"
      description="Create your first."
      action={<button type="button">New document</button>}
    />,
  );
  expect(screen.getByRole("button", { name: "New document" })).toBeTruthy();
});

test("filtered variant carries a distinct data attribute", () => {
  const { rerender } = render(
    <EmptyState
      variant="filtered"
      title="No matches"
      description="Adjust filters."
    />,
  );
  expect(screen.getByTestId("empty-state").dataset.variant).toBe("filtered");

  rerender(
    <EmptyState
      variant="first-use"
      title="Empty"
      description="Nothing here."
    />,
  );
  expect(screen.getByTestId("empty-state").dataset.variant).toBe("first-use");
});

test("renders a custom icon when provided", () => {
  render(
    <EmptyState
      variant="first-use"
      title="Empty"
      description="Nothing here."
      icon={<svg data-testid="my-icon" aria-hidden />}
    />,
  );
  expect(screen.getByTestId("my-icon")).toBeTruthy();
});
