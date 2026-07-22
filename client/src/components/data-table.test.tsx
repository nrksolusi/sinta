// @vitest-environment jsdom
import type { ColumnDef } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { DataTable } from "./data-table";

type Row = { id: string; code: string; name: string };

const columns: ColumnDef<Row>[] = [
  { accessorKey: "code", header: "Code" },
  { accessorKey: "name", header: "Name" },
];

const data: Row[] = [
  { id: "1", code: "B", name: "Banana" },
  { id: "2", code: "A", name: "Apple" },
];

// Read the "name" cell of each body row, in render order.
function nameColumn(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent ?? "");
}

test("renders a header row plus one row per data item", () => {
  render(<DataTable columns={columns} data={data} getRowId={(r) => r.id} />);

  // header row + two data rows
  expect(screen.getAllByRole("row")).toHaveLength(3);
  expect(nameColumn()).toEqual(["Banana", "Apple"]);
});

test("clicking a sortable column header toggles the row order", async () => {
  const user = userEvent.setup();
  render(<DataTable columns={columns} data={data} getRowId={(r) => r.id} />);

  // Unsorted: original data order.
  expect(nameColumn()).toEqual(["Banana", "Apple"]);

  const nameHeader = screen.getByRole("button", { name: "Name" });
  await user.click(nameHeader);
  expect(nameColumn()).toEqual(["Apple", "Banana"]); // ascending

  await user.click(nameHeader);
  expect(nameColumn()).toEqual(["Banana", "Apple"]); // descending
});

test("renders expanded content only for the expanded row", () => {
  render(
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      expandedRowId="2"
      renderExpandedRow={(row) => <div>editing {row.name}</div>}
    />,
  );

  expect(screen.getByText("editing Apple")).toBeTruthy();
  expect(screen.queryByText("editing Banana")).toBeNull();
});
