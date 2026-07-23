import { expect, test } from "vitest";
import type { GridLine } from "@/components/line-grid";
import type { Product } from "@/lib/pickers-data";
import type { StockTransfer } from "./-transfers-data";
import {
  buildTransferTimeline,
  postConfirmSpecifics,
  sameWarehouse,
  toTransferInput,
  transferDocRows,
  transferLinesToGrid,
  transferTotalQty,
} from "./-transfers-data";

const PRODUCT_A: Product = {
  id: "prod-a",
  sku: "IDM-001",
  name: "Indomie Goreng",
  baseUom: "dus",
  status: "active",
  isBatchTracked: false,
};

const PRODUCT_B: Product = {
  id: "prod-b",
  sku: "BRS-005",
  name: "Beras 5kg",
  baseUom: "sak",
  status: "active",
  isBatchTracked: false,
};

function transfer(over: Partial<StockTransfer> = {}): StockTransfer {
  return {
    id: "tr-1",
    docNumber: "TF-2026-0001",
    docDate: "2026-07-21",
    fromWarehouseId: "wh-1",
    toWarehouseId: "wh-2",
    notes: "",
    status: "posted",
    createdAt: "2026-07-21T00:00:00Z",
    createdBy: { id: "u1", displayName: "Test User" },
    lines: [
      { id: "l1", lineNo: 1, productId: "prod-a", qty: "24", uom: "dus" },
      { id: "l2", lineNo: 2, productId: "prod-b", qty: "6", uom: "sak" },
    ],
    ...over,
  };
}

const warehouseName = (id: string) =>
  ({ "wh-1": "GD-01", "wh-2": "GD-02" })[id] ?? id;

test("sameWarehouse is true only when both ids are set and equal", () => {
  expect(sameWarehouse("wh-1", "wh-1")).toBe(true);
  expect(sameWarehouse("wh-1", "wh-2")).toBe(false);
  expect(sameWarehouse("", "")).toBe(false);
  expect(sameWarehouse("wh-1", "")).toBe(false);
  expect(sameWarehouse("", "wh-2")).toBe(false);
});

test("transferTotalQty sums the line quantities as a number", () => {
  const lines: GridLine[] = [
    { key: "k1", product: PRODUCT_A, qty: "24" },
    { key: "k2", product: PRODUCT_B, qty: "6" },
  ];
  expect(transferTotalQty(lines)).toBe(30);
});

test("transferTotalQty ignores blank and non-numeric quantities", () => {
  const lines: GridLine[] = [
    { key: "k1", product: PRODUCT_A, qty: "" },
    { key: "k2", product: PRODUCT_B, qty: "abc" },
    { key: "k3", product: PRODUCT_A, qty: "5" },
  ];
  expect(transferTotalQty(lines)).toBe(5);
});

test("transferDocRows maps a transfer to a DocList row with Dari -> Ke and total qty", () => {
  const rows = transferDocRows(
    [transfer()],
    warehouseName,
    (from, to) => `${from} -> ${to}`,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: "tr-1",
    number: "TF-2026-0001",
    date: "2026-07-21",
    counterparty: "GD-01 -> GD-02",
    warehouse: "GD-01",
    total: 30,
    status: "posted",
  });
});

test("transferDocRows shows null number for a draft", () => {
  const rows = transferDocRows(
    [transfer({ status: "draft", docNumber: null })],
    warehouseName,
    (from, to) => `${from} -> ${to}`,
  );
  expect(rows[0].number).toBeNull();
});

test("toTransferInput builds the API body from form state and grid lines", () => {
  const lines: GridLine[] = [
    { key: "k1", product: PRODUCT_A, qty: "24" },
    { key: "k2", product: PRODUCT_B, qty: "6" },
  ];
  expect(
    toTransferInput({
      fromWarehouseId: "wh-1",
      toWarehouseId: "wh-2",
      docDate: "2026-07-21",
      notes: "urgent",
      lines,
    }),
  ).toEqual({
    fromWarehouseId: "wh-1",
    toWarehouseId: "wh-2",
    docDate: "2026-07-21",
    notes: "urgent",
    lines: [
      { productId: "prod-a", uom: "dus", qty: "24" },
      { productId: "prod-b", uom: "sak", qty: "6" },
    ],
  });
});

test("toTransferInput omits notes when blank", () => {
  const input = toTransferInput({
    fromWarehouseId: "wh-1",
    toWarehouseId: "wh-2",
    docDate: "2026-07-21",
    notes: "   ",
    lines: [{ key: "k1", product: PRODUCT_A, qty: "1" }],
  });
  expect(input.notes).toBeUndefined();
});

test("postConfirmSpecifics restates line count, total qty, and route", () => {
  const lines: GridLine[] = [
    { key: "k1", product: PRODUCT_A, qty: "24" },
    { key: "k2", product: PRODUCT_B, qty: "6" },
  ];
  expect(
    postConfirmSpecifics({
      lines,
      fromName: "GD-01",
      toName: "GD-02",
    }),
  ).toEqual({ lineCount: 2, totalQty: 30, fromName: "GD-01", toName: "GD-02" });
});

test("transferLinesToGrid resolves each line's product for the grid", () => {
  const byId = new Map<string, Product>([
    ["prod-a", PRODUCT_A],
    ["prod-b", PRODUCT_B],
  ]);
  const grid = transferLinesToGrid(transfer().lines, byId);
  expect(grid).toHaveLength(2);
  expect(grid[0]).toMatchObject({ product: PRODUCT_A, qty: "24" });
  expect(grid[1]).toMatchObject({ product: PRODUCT_B, qty: "6" });
  // keys are unique so the grid can track rows
  expect(grid[0].key).not.toEqual(grid[1].key);
});

test("transferLinesToGrid skips lines whose product is missing", () => {
  const byId = new Map<string, Product>([["prod-a", PRODUCT_A]]);
  const grid = transferLinesToGrid(transfer().lines, byId);
  expect(grid).toHaveLength(1);
  expect(grid[0].product).toBe(PRODUCT_A);
});

test("buildTransferTimeline lists created and posted for a posted transfer", () => {
  const labels = {
    created: "Dibuat",
    posted: "Diposting",
    reversed: "Dibatalkan",
  };
  const entries = buildTransferTimeline(transfer(), labels);
  const actions = entries.map((e) => e.action);
  expect(actions).toContain("Dibuat");
  expect(actions).toContain("Diposting");
  expect(actions).not.toContain("Dibatalkan");
});

test("buildTransferTimeline adds a reversed entry once the transfer is reversed", () => {
  const labels = {
    created: "Dibuat",
    posted: "Diposting",
    reversed: "Dibatalkan",
  };
  const reversed = transfer({ status: "reversed", reversedById: "tr-2" });
  const actions = buildTransferTimeline(reversed, labels).map((e) => e.action);
  expect(actions).toContain("Dibatalkan");
});
