// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { DocList, type DocListFilters, type DocRow } from "./doc-list";

overwriteGetLocale(() => "en");

const rows: DocRow[] = [
  {
    id: "1",
    number: "GR-2026-0015",
    date: "2026-07-21",
    counterparty: "PT Maju Jaya",
    warehouse: "GD-01",
    total: "1240000",
    status: "posted",
  },
  {
    id: "2",
    number: null,
    date: "2026-07-22",
    counterparty: "CV Sinar Baru",
    warehouse: "GD-01",
    total: null,
    status: "draft",
  },
  {
    id: "3",
    number: "GR-2026-0012",
    date: "2026-07-19",
    counterparty: "PT Maju Jaya",
    warehouse: "GD-02",
    total: "880000",
    status: "reversed",
  },
];

const emptyFilters: DocListFilters = {};

function bodyRowCounterparties(): string[] {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[2]?.textContent ?? "");
}

test("renders default columns and one row per document", () => {
  render(
    <DocList
      docType="goods-receipt"
      rows={rows}
      filters={emptyFilters}
      onFiltersChange={() => {}}
      onRowClick={() => {}}
    />,
  );
  const table = screen.getByRole("table");
  // header + 3 data rows
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  expect(screen.getByText("GR-2026-0015")).toBeTruthy();
});

test("drafts sort first, then newest date", () => {
  render(
    <DocList
      docType="goods-receipt"
      rows={rows}
      filters={emptyFilters}
      onFiltersChange={() => {}}
      onRowClick={() => {}}
    />,
  );
  // draft (CV Sinar Baru) first, then 21 Jul (PT Maju Jaya), then 19 Jul.
  expect(bodyRowCounterparties()).toEqual([
    "CV Sinar Baru",
    "PT Maju Jaya",
    "PT Maju Jaya",
  ]);
});

test("clicking a row invokes onRowClick with the row", async () => {
  const user = userEvent.setup();
  const onRowClick = vi.fn();
  render(
    <DocList
      docType="goods-receipt"
      rows={rows}
      filters={emptyFilters}
      onFiltersChange={() => {}}
      onRowClick={onRowClick}
    />,
  );
  await user.click(screen.getByText("GR-2026-0015"));
  expect(onRowClick).toHaveBeenCalledTimes(1);
  expect(onRowClick.mock.calls[0][0].id).toBe("1");
});

test("loading shows skeleton rows and no empty state", () => {
  render(
    <DocList
      docType="goods-receipt"
      rows={[]}
      loading
      filters={emptyFilters}
      onFiltersChange={() => {}}
      onRowClick={() => {}}
    />,
  );
  expect(screen.getByTestId("doc-list-skeleton")).toBeTruthy();
  expect(screen.queryByTestId("empty-state")).toBeNull();
});

test("empty with no filters shows the first-use empty state", () => {
  render(
    <DocList
      docType="goods-receipt"
      rows={[]}
      filters={emptyFilters}
      onFiltersChange={() => {}}
      onRowClick={() => {}}
    />,
  );
  expect(screen.getByTestId("empty-state").dataset.variant).toBe("first-use");
});

test("empty with active filters shows the filtered empty state", () => {
  render(
    <DocList
      docType="goods-receipt"
      rows={[]}
      filters={{ status: "posted" }}
      onFiltersChange={() => {}}
      onRowClick={() => {}}
    />,
  );
  expect(screen.getByTestId("empty-state").dataset.variant).toBe("filtered");
});

test("active filters render as removable chips that clear on click", async () => {
  const user = userEvent.setup();
  const onFiltersChange = vi.fn();
  render(
    <DocList
      docType="goods-receipt"
      rows={rows}
      filters={{ status: "posted", warehouse: "GD-01" }}
      onFiltersChange={onFiltersChange}
      onRowClick={() => {}}
    />,
  );
  // Two chips, each with a remove control.
  const removeButtons = screen.getAllByRole("button", {
    name: "Remove filter",
  });
  expect(removeButtons).toHaveLength(2);

  await user.click(removeButtons[0]);
  // Removing the status chip yields a filter object without status.
  expect(onFiltersChange).toHaveBeenCalledTimes(1);
  expect(onFiltersChange.mock.calls[0][0]).not.toHaveProperty("status");
});
