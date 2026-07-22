import { expect, test } from "vitest";
import type { GridLine } from "@/components/line-grid";
import type { Product, Warehouse } from "@/lib/pickers-data";
import {
  adjustmentDocRows,
  adjustmentNetEffect,
  draftUnavailableReason,
  gridLinesToPayload,
  linesFromAdjustment,
  type StockAdjustment,
} from "./-adjustments-data";

function product(id: string, over: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    sku: `SKU-${id}`,
    baseUom: "pcs",
    isBatchTracked: false,
    status: "active",
    ...over,
  };
}

function warehouse(id: string, over: Partial<Warehouse> = {}): Warehouse {
  return { id, name: `Gudang ${id}`, code: `GD-${id}`, ...over };
}

function line(over: Partial<GridLine> = {}): GridLine {
  return {
    key: "k",
    product: product("p1"),
    qty: "1",
    cost: "1000",
    sign: 1,
    ...over,
  };
}

test("gridLinesToPayload negates qty for decrease lines and keeps increases positive", () => {
  const lines: GridLine[] = [
    line({ key: "a", product: product("p1"), qty: "5", cost: "1000", sign: 1 }),
    line({
      key: "b",
      product: product("p2"),
      qty: "3",
      cost: "2000",
      sign: -1,
    }),
  ];
  expect(gridLinesToPayload(lines)).toEqual([
    { productId: "p1", uom: "pcs", qty: "5", unitCost: "1000" },
    { productId: "p2", uom: "pcs", qty: "-3", unitCost: "2000" },
  ]);
});

test("gridLinesToPayload omits unitCost when a line has no cost entered", () => {
  const lines: GridLine[] = [
    line({ key: "a", product: product("p1"), qty: "2", cost: "", sign: 1 }),
  ];
  expect(gridLinesToPayload(lines)).toEqual([
    { productId: "p1", uom: "pcs", qty: "2" },
  ]);
});

test("gridLinesToPayload does not double-negate an already-negative qty", () => {
  const lines: GridLine[] = [
    line({ key: "a", product: product("p1"), qty: "-4", cost: "10", sign: -1 }),
  ];
  expect(gridLinesToPayload(lines)[0].qty).toBe("-4");
});

test("linesFromAdjustment splits signed qty into abs qty + sign, resolving products", () => {
  const adjustment: StockAdjustment = {
    id: "adj1",
    docDate: "2026-07-22",
    docNumber: null,
    warehouseId: "w1",
    reason: "Barang rusak",
    notes: "",
    status: "draft",
    createdAt: "2026-07-22T00:00:00Z",
    createdBy: { id: "u1", displayName: "Test User" },
    lines: [
      {
        id: "l1",
        lineNo: 1,
        productId: "p1",
        qty: "5",
        unitCost: "1000",
        uom: "pcs",
      },
      {
        id: "l2",
        lineNo: 2,
        productId: "p2",
        qty: "-3",
        unitCost: "2000",
        uom: "dus",
      },
    ],
  };
  const products = [product("p1"), product("p2")];
  const result = linesFromAdjustment(adjustment, products);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({ qty: "5", sign: 1, cost: "1000" });
  expect(result[0].product.id).toBe("p1");
  expect(result[1]).toMatchObject({ qty: "3", sign: -1, cost: "2000" });
  expect(result[1].product.id).toBe("p2");
});

test("linesFromAdjustment falls back to a placeholder product when unknown", () => {
  const adjustment: StockAdjustment = {
    id: "adj1",
    docDate: "2026-07-22",
    warehouseId: "w1",
    reason: "x",
    notes: "",
    status: "draft",
    createdAt: "2026-07-22T00:00:00Z",
    createdBy: { id: "u1", displayName: "Test User" },
    lines: [
      {
        id: "l1",
        lineNo: 1,
        productId: "ghost",
        qty: "1",
        unitCost: "0",
        uom: "pcs",
      },
    ],
  };
  const result = linesFromAdjustment(adjustment, []);
  expect(result[0].product.id).toBe("ghost");
  expect(result[0].product.baseUom).toBe("pcs");
});

test("adjustmentNetEffect sums increases and decreases separately", () => {
  const lines: GridLine[] = [
    line({ key: "a", qty: "5", sign: 1 }),
    line({ key: "b", qty: "3", sign: -1 }),
    line({ key: "c", qty: "2", sign: 1 }),
  ];
  expect(adjustmentNetEffect(lines)).toEqual({ increase: 7, decrease: 3 });
});

test("adjustmentNetEffect ignores non-numeric qty", () => {
  const lines: GridLine[] = [
    line({ key: "a", qty: "", sign: 1 }),
    line({ key: "b", qty: "4", sign: -1 }),
  ];
  expect(adjustmentNetEffect(lines)).toEqual({ increase: 0, decrease: 4 });
});

test("draftUnavailableReason requires warehouse, reason, and a line in order", () => {
  const good = line({ qty: "2", sign: 1 });
  expect(
    draftUnavailableReason({ warehouseId: "", reason: "x", lines: [good] }),
  ).toBe("warehouse");
  expect(
    draftUnavailableReason({ warehouseId: "w", reason: "", lines: [good] }),
  ).toBe("reason");
  expect(
    draftUnavailableReason({ warehouseId: "w", reason: "   ", lines: [good] }),
  ).toBe("reason");
  expect(
    draftUnavailableReason({ warehouseId: "w", reason: "x", lines: [] }),
  ).toBe("lines");
  expect(
    draftUnavailableReason({ warehouseId: "w", reason: "x", lines: [good] }),
  ).toBeNull();
});

test("draftUnavailableReason flags a zero or blank qty line", () => {
  expect(
    draftUnavailableReason({
      warehouseId: "w",
      reason: "x",
      lines: [line({ qty: "0", sign: 1 })],
    }),
  ).toBe("lines");
});

test("adjustmentDocRows maps to DocRow with warehouse name, reason, and signed total", () => {
  const adjustments: StockAdjustment[] = [
    {
      id: "adj1",
      docDate: "2026-07-22",
      docNumber: "ADJ-2026-0001",
      warehouseId: "w1",
      reason: "Barang rusak",
      notes: "",
      status: "posted",
      createdAt: "2026-07-22T00:00:00Z",
      createdBy: { id: "u1", displayName: "Test User" },
      lines: [
        {
          id: "l1",
          lineNo: 1,
          productId: "p1",
          qty: "5",
          unitCost: "1000",
          uom: "pcs",
        },
        {
          id: "l2",
          lineNo: 2,
          productId: "p2",
          qty: "-2",
          unitCost: "500",
          uom: "pcs",
        },
      ],
    },
  ];
  const rows = adjustmentDocRows(adjustments, [warehouse("w1")]);
  expect(rows[0]).toMatchObject({
    id: "adj1",
    number: "ADJ-2026-0001",
    counterparty: "Barang rusak",
    warehouse: "GD-w1",
    status: "posted",
  });
  // signed value: 5*1000 + (-2)*500 = 4000
  expect(rows[0].total).toBe(4000);
});

test("adjustmentDocRows leaves a draft number null and unknown warehouse as its id", () => {
  const adjustments: StockAdjustment[] = [
    {
      id: "adj2",
      docDate: "2026-07-22",
      docNumber: null,
      warehouseId: "wX",
      reason: "",
      notes: "",
      status: "draft",
      createdAt: "2026-07-22T00:00:00Z",
      createdBy: { id: "u1", displayName: "Test User" },
      lines: [],
    },
  ];
  const rows = adjustmentDocRows(adjustments, []);
  expect(rows[0].number).toBeNull();
  expect(rows[0].warehouse).toBe("wX");
});
