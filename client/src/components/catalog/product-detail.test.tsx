// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import {
  docHref,
  KartuStokTable,
  ProductStockTable,
  ProductSummaryCard,
} from "./product-detail";

overwriteGetLocale(() => "id");

test("docHref maps each document type to its Wave-2 detail route", () => {
  expect(docHref("goods_receipt", "d1")).toBe("/purchases/receipts/d1");
  expect(docHref("purchase_order", "d2")).toBe("/purchases/orders/d2");
  expect(docHref("sales_order", "d3")).toBe("/sales/orders/d3");
  expect(docHref("delivery", "d4")).toBe("/sales/deliveries/d4");
  expect(docHref("stock_transfer", "d5")).toBe("/stock/transfers/d5");
  expect(docHref("stock_adjustment", "d6")).toBe("/stock/adjustments/d6");
  expect(docHref("stock_opname", "d7")).toBe("/stock/opnames/d7");
});

test("docHref returns null for an unknown or missing doc type/id", () => {
  expect(docHref("mystery", "d1")).toBeNull();
  expect(docHref(undefined, "d1")).toBeNull();
  expect(docHref("goods_receipt", undefined)).toBeNull();
});

const onHand = [
  {
    productId: "p1",
    productName: "Indomie Goreng",
    sku: "IDM-001",
    qtyOnHand: "40",
    warehouseId: "w1",
    warehouseCode: "GD-01",
    warehouseName: "Gudang Utama",
  },
  {
    productId: "p1",
    productName: "Indomie Goreng",
    sku: "IDM-001",
    qtyOnHand: "24",
    warehouseId: "w2",
    warehouseCode: "GD-02",
    warehouseName: "Gudang Cabang",
  },
];

const valuation = [
  {
    productId: "p1",
    productName: "Indomie Goreng",
    sku: "IDM-001",
    qtyOnHand: "40",
    avgCost: "98000",
    value: "3920000",
    warehouseId: "w1",
    warehouseCode: "GD-01",
    warehouseName: "Gudang Utama",
  },
  {
    productId: "p1",
    productName: "Indomie Goreng",
    sku: "IDM-001",
    qtyOnHand: "24",
    avgCost: "98000",
    value: "2352000",
    warehouseId: "w2",
    warehouseCode: "GD-02",
    warehouseName: "Gudang Cabang",
  },
];

test("ProductStockTable joins on-hand with valuation per warehouse", () => {
  render(
    <ProductStockTable
      onHand={onHand}
      valuation={valuation}
      batchTracked={false}
    />,
  );
  const gd01 = screen.getByText("GD-01").closest("tr");
  expect(gd01).not.toBeNull();
  const row = within(gd01 as HTMLElement);
  // qty and value render through format.ts (id-ID grouping).
  expect(row.getByText("40")).toBeTruthy();
  expect(row.getByText("Rp 3.920.000")).toBeTruthy();
  // Both warehouse rows present.
  expect(screen.getByText("GD-02")).toBeTruthy();
});

test("ProductStockTable shows the empty state when there is no stock", () => {
  render(<ProductStockTable onHand={[]} valuation={[]} batchTracked={false} />);
  expect(screen.getByText("Belum ada stok untuk produk ini.")).toBeTruthy();
});

test("ProductStockTable hides the Batch column when not batch-tracked", () => {
  render(
    <ProductStockTable
      onHand={onHand}
      valuation={valuation}
      batchTracked={false}
    />,
  );
  expect(screen.queryByRole("columnheader", { name: "Batch" })).toBeNull();
});

test("ProductSummaryCard totals qty and value and derives avg cost", () => {
  render(<ProductSummaryCard valuation={valuation} />);
  // total qty = 40 + 24 = 64
  const totalQty = screen.getByText("Total qty").closest("div");
  expect(within(totalQty as HTMLElement).getByText("64")).toBeTruthy();
  // total nilai = 3.920.000 + 2.352.000 = 6.272.000
  const totalValue = screen.getByText("Total nilai").closest("div");
  expect(
    within(totalValue as HTMLElement).getByText("Rp 6.272.000"),
  ).toBeTruthy();
  // avg cost = 6.272.000 / 64 = 98.000 (weighted average across warehouses)
  const avgCost = screen.getByText("Avg cost").closest("div");
  expect(within(avgCost as HTMLElement).getByText("Rp 98.000")).toBeTruthy();
});

test("ProductSummaryCard shows zero avg cost when there is no stock", () => {
  render(<ProductSummaryCard valuation={[]} />);
  const avgCost = screen.getByText("Avg cost").closest("div");
  expect(within(avgCost as HTMLElement).getByText("Rp 0")).toBeTruthy();
});

function entry(
  over: Partial<
    import("@/lib/api-types").components["schemas"]["StockCardEntry"]
  > = {},
) {
  return {
    movementId: "m1",
    seq: 1,
    effectiveAt: "2026-07-21T02:00:00Z",
    movementType: "receipt" as const,
    qty: "24",
    runningQty: "64",
    unitCost: "98000",
    runningValue: "6272000",
    warehouseId: "w1",
    provisional: false,
    docType: "goods_receipt",
    docId: "gr1",
    ...over,
  };
}

test("KartuStokTable links each movement's document via docHref", () => {
  render(<KartuStokTable entries={[entry()]} />);
  const link = screen.getByRole("link");
  expect(link).toHaveProperty(
    "href",
    expect.stringContaining("/purchases/receipts/gr1"),
  );
});

test("KartuStokTable renders signed qty and running balance", () => {
  render(<KartuStokTable entries={[entry({ qty: "24", runningQty: "64" })]} />);
  // Receipts read with an explicit "+" in the audit trail (D7).
  expect(screen.getByText("+24")).toBeTruthy();
  expect(screen.getByText("64")).toBeTruthy();
});

test("KartuStokTable keeps the negative sign for issues", () => {
  render(<KartuStokTable entries={[entry({ qty: "-6", runningQty: "58" })]} />);
  expect(screen.getByText("-6")).toBeTruthy();
});

test("KartuStokTable shows plain text when the movement has no document", () => {
  render(
    <KartuStokTable
      entries={[entry({ docType: undefined, docId: undefined })]}
    />,
  );
  expect(screen.queryByRole("link")).toBeNull();
  // movement type label stands in for the missing doc reference.
  expect(screen.getByText("Penerimaan")).toBeTruthy();
});

test("KartuStokTable caps the list at 20 rows, newest first", () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    entry({ movementId: `m${i}`, seq: i + 1, runningQty: String(i) }),
  );
  render(<KartuStokTable entries={many} />);
  expect(screen.getAllByRole("row").length).toBe(21); // 20 data rows + header
});

test("KartuStokTable shows the empty state when there are no movements", () => {
  render(<KartuStokTable entries={[]} />);
  expect(screen.getByText("Belum ada pergerakan stok.")).toBeTruthy();
});
