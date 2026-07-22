// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import type { Product } from "@/lib/pickers-data";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { type GridLine, LineGrid, lineGridTotals } from "./line-grid";

overwriteGetLocale(() => "en");

const kopi: Product = {
  id: "11111111-1111-1111-1111-111111111111",
  sku: "SKU-1",
  name: "Kopi Bubuk 200g",
  baseUom: "pcs",
  isBatchTracked: false,
  status: "active",
};
const teh: Product = {
  id: "22222222-2222-2222-2222-222222222222",
  sku: "SKU-2",
  name: "Teh Celup",
  baseUom: "box",
  isBatchTracked: false,
  status: "active",
};

// Stub the picker: it only needs to fire onSelect with a product when its two
// fake buttons are clicked. The real ProductCombobox has its own tests.
vi.mock("./product-combobox", () => ({
  ProductCombobox: ({ onSelect }: { onSelect: (p: Product) => void }) => (
    <div>
      <button type="button" onClick={() => onSelect(kopi)}>
        add-kopi
      </button>
      <button type="button" onClick={() => onSelect(teh)}>
        add-teh
      </button>
    </div>
  ),
}));

vi.mock("./scanner-dialog", () => ({
  ScannerDialog: () => null,
}));

function Harness({
  withCost = false,
  readOnly = false,
  signedQty = false,
  initial = [],
}: {
  withCost?: boolean;
  readOnly?: boolean;
  signedQty?: boolean;
  initial?: GridLine[];
}) {
  const [lines, setLines] = useState<GridLine[]>(initial);
  return (
    <LineGrid
      lines={lines}
      onChange={setLines}
      withCost={withCost}
      qtyLabel="Quantity"
      readOnly={readOnly}
      signedQty={signedQty}
      totals={lineGridTotals(lines, { withCost })}
    />
  );
}

test("empty state shows the EmptyState prompt", () => {
  render(<Harness />);
  expect(screen.getByTestId("empty-state")).toBeTruthy();
  expect(screen.getByText("No lines yet")).toBeTruthy();
});

test("selecting a product appends a row and focuses the qty cell pre-filled 1", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "add-kopi" }));

  expect(screen.getByText("Kopi Bubuk 200g")).toBeTruthy();
  const qty = screen.getByLabelText(/Quantity/) as HTMLInputElement;
  expect(qty.value).toBe("1");
  expect(document.activeElement).toBe(qty);
});

test("selecting the same product again increments the existing row (no duplicate)", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "add-kopi" }));
  const qty = screen.getByLabelText(/Quantity/) as HTMLInputElement;
  await user.clear(qty);
  await user.type(qty, "3");
  await user.click(screen.getByRole("button", { name: "add-kopi" }));

  expect(screen.getAllByText("Kopi Bubuk 200g")).toHaveLength(1);
  const qtyAfter = screen.getByLabelText(/Quantity/) as HTMLInputElement;
  expect(qtyAfter.value).toBe("4");
});

test("Enter in the qty cell returns focus to the search box", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "add-kopi" }));
  const qty = screen.getByLabelText(/Quantity/) as HTMLInputElement;
  await user.clear(qty);
  await user.type(qty, "5{Enter}");

  // Focus lands on the search region so the next scan/type appends again.
  const search = screen.getByTestId("line-grid-search");
  expect(search.contains(document.activeElement)).toBe(true);
});

test("totals reflect the lines", () => {
  const lines: GridLine[] = [
    { key: "a", product: kopi, qty: "2", cost: "1000" },
    { key: "b", product: teh, qty: "3", cost: "500" },
  ];
  render(<Harness withCost initial={lines} />);

  const totals = screen.getByTestId("line-grid-totals");
  expect(within(totals).getByText("2 lines")).toBeTruthy();
  // total qty 5
  expect(within(totals).getByText("5")).toBeTruthy();
  // total value 2*1000 + 3*500 = 3500 -> Rp3.500
  expect(within(totals).getByText(/3\.500/)).toBeTruthy();
});

test("readOnly renders the grid frozen (no inputs, no search)", () => {
  const lines: GridLine[] = [{ key: "a", product: kopi, qty: "2" }];
  render(<Harness readOnly initial={lines} />);

  expect(screen.getByText("Kopi Bubuk 200g")).toBeTruthy();
  expect(screen.queryByLabelText(/Quantity/)).toBeNull();
  expect(screen.queryByTestId("line-grid-search")).toBeNull();
});

test("signedQty renders a per-line sign toggle", async () => {
  const user = userEvent.setup();
  const lines: GridLine[] = [{ key: "a", product: kopi, qty: "2", sign: 1 }];

  function SignedHarness() {
    const [rows, setRows] = useState<GridLine[]>(lines);
    return (
      <LineGrid
        lines={rows}
        onChange={setRows}
        withCost={false}
        qtyLabel="Quantity"
        readOnly={false}
        signedQty
        totals={lineGridTotals(rows, { withCost: false, signedQty: true })}
      />
    );
  }
  render(<SignedHarness />);

  const toggle = screen.getByRole("button", { name: /Increase|Decrease/ });
  expect(toggle).toBeTruthy();
  await user.click(toggle);
  // After toggling to decrease, the signed total qty is -2.
  const totals = screen.getByTestId("line-grid-totals");
  expect(within(totals).getByText(/-2|−2/)).toBeTruthy();
});

test("lineGridTotals computes lines, qty, and value", () => {
  const lines: GridLine[] = [
    { key: "a", product: kopi, qty: "2", cost: "1000" },
    { key: "b", product: teh, qty: "3", cost: "500" },
  ];
  const totals = lineGridTotals(lines, { withCost: true });
  expect(totals.lines).toBe(2);
  expect(totals.totalQty).toBe(5);
  expect(totals.totalValue).toBe(3500);
});
