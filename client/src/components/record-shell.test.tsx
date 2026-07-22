// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { RecordShell } from "./record-shell";

overwriteGetLocale(() => "en");

const timeline = [
  {
    action: "Posted by Ardianto",
    actor: "Ardianto",
    at: "2026-07-21T14:02:00Z",
  },
  {
    action: "Created by Ardianto",
    actor: "Ardianto",
    at: "2026-07-21T13:55:00Z",
  },
];

test("renders the breadcrumb with links and the current page", () => {
  render(
    <RecordShell
      breadcrumb={[
        { label: "Purchases", to: "/purchases" },
        { label: "Receipts", to: "/purchases/receipts" },
        { label: "GR-2026-0015" },
      ]}
      title="GR-2026-0015"
      status="posted"
      actions={<button type="button">Cancel</button>}
      timeline={timeline}
    >
      <div>line grid</div>
    </RecordShell>,
  );

  const nav = screen.getByRole("navigation", { name: "breadcrumb" });
  expect(within(nav).getByRole("link", { name: "Purchases" })).toHaveProperty(
    "href",
    expect.stringContaining("/purchases"),
  );
  expect(within(nav).getByText("GR-2026-0015")).toBeTruthy();
});

test("renders title, status badge, actions, and children", () => {
  render(
    <RecordShell
      breadcrumb={[{ label: "GR-2026-0015" }]}
      title="GR-2026-0015"
      status="posted"
      actions={<button type="button">Cancel</button>}
      timeline={timeline}
    >
      <div>line grid</div>
    </RecordShell>,
  );

  expect(screen.getByRole("heading", { name: "GR-2026-0015" })).toBeTruthy();
  expect(screen.getByText("Posted")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  expect(screen.getByText("line grid")).toBeTruthy();
});

test("renders the optional banner slot", () => {
  render(
    <RecordShell
      breadcrumb={[{ label: "GR" }]}
      title="GR"
      status="reversed"
      actions={null}
      banner={<div>Reversed by GR-2026-0018</div>}
      timeline={timeline}
    >
      <div>content</div>
    </RecordShell>,
  );
  expect(screen.getByText("Reversed by GR-2026-0018")).toBeTruthy();
});

test("renders the mini timeline with formatted timestamps", () => {
  render(
    <RecordShell
      breadcrumb={[{ label: "GR" }]}
      title="GR"
      status="posted"
      actions={null}
      timeline={timeline}
    >
      <div>content</div>
    </RecordShell>,
  );

  expect(screen.getByText("History")).toBeTruthy();
  expect(screen.getByText("Posted by Ardianto")).toBeTruthy();
  expect(screen.getByText("Created by Ardianto")).toBeTruthy();
  // formatDate renders "21 Jul 2026" (id-ID medium); assert the day/year land.
  expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(2);
});
