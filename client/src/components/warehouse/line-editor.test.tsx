// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import type { Product } from "@/lib/catalog";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { type DocLine, LineEditor } from "./line-editor";

// The app's baseLocale is Indonesian (primary UI language); pin English here so
// these assertions on UI copy are deterministic.
overwriteGetLocale(() => "en");

// Stub the camera scanner: it only needs to surface a "scan" button that fires
// onScan with a known barcode. The real BarcodeScanner is exercised by its own
// module tests; here we only care that LineEditor wires a scan to a product.
vi.mock("@/components/barcode-scanner", () => ({
  BarcodeScanner: ({ onScan }: { onScan: (b: string) => void }) => (
    <button type="button" onClick={() => onScan("8991234567890")}>
      fake-scan
    </button>
  ),
}));

const products: Product[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    sku: "SKU-1",
    name: "Kopi Bubuk 200g",
    baseUom: "pcs",
    isBatchTracked: false,
    barcode: "8991234567890",
    status: "active",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    sku: "SKU-2",
    name: "Teh Celup",
    baseUom: "box",
    isBatchTracked: false,
    status: "active",
  },
];

function Harness({ withCost }: { withCost?: boolean }) {
  const [lines, setLines] = useState<DocLine[]>([]);
  return (
    <LineEditor
      products={products}
      lines={lines}
      onChange={setLines}
      withCost={withCost}
      qtyLabel="Quantity"
    />
  );
}

test("adds a product line via the picker and edits its quantity", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.selectOptions(
    screen.getByRole("combobox"),
    "11111111-1111-1111-1111-111111111111",
  );

  expect(screen.getByText("Kopi Bubuk 200g")).toBeTruthy();

  const qty = screen.getByLabelText("Quantity") as HTMLInputElement;
  await user.type(qty, "12");
  expect(qty.value).toBe("12");
});

test("scanning a barcode resolves and adds the matching product", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "Scan barcode" }));
  await user.click(screen.getByRole("button", { name: "fake-scan" }));

  expect(screen.getByText("Kopi Bubuk 200g")).toBeTruthy();
});

test("does not duplicate a line when the same product is added twice", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  const picker = screen.getByRole("combobox");
  await user.selectOptions(picker, "22222222-2222-2222-2222-222222222222");
  await user.selectOptions(picker, "22222222-2222-2222-2222-222222222222");

  expect(screen.getAllByText("Teh Celup")).toHaveLength(1);
});

test("shows a unit-cost input only when withCost is set", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Harness />);

  await user.selectOptions(
    screen.getByRole("combobox"),
    "11111111-1111-1111-1111-111111111111",
  );
  expect(screen.queryByText("Unit cost")).toBeNull();

  rerender(<Harness withCost />);
  await user.selectOptions(
    screen.getByRole("combobox"),
    "11111111-1111-1111-1111-111111111111",
  );
  expect(screen.getByText("Unit cost")).toBeTruthy();
});
