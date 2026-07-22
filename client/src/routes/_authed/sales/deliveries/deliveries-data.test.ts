import { expect, test } from "vitest";
import type { GridLine } from "@/components/line-grid";
import type { Partner, Product, Warehouse } from "@/lib/pickers-data";
import {
  activeDeliveryFilters,
  type Delivery,
  deliveryLinesToGrid,
  deliveryToDocRow,
  deliveryTotalQty,
  filterDeliveries,
  gridToDeliveryLines,
  type SalesOrder,
  salesOrderToDraftSeed,
} from "./-deliveries-data";
import { draftBlockReason } from "./-delivery-draft-form";

const product = (id: string, over: Partial<Product> = {}): Product => ({
  id,
  name: `Product ${id}`,
  sku: `SKU-${id}`,
  baseUom: "pcs",
  isBatchTracked: false,
  status: "active",
  ...over,
});

const warehouse = (id: string, code: string): Warehouse => ({
  id,
  code,
  name: `Warehouse ${code}`,
});

const customer = (id: string, name: string): Partner => ({
  id,
  code: `C-${id}`,
  name,
  isCustomer: true,
  isSupplier: false,
  status: "active",
});

const delivery = (over: Partial<Delivery> = {}): Delivery => ({
  id: "d1",
  customerId: "c1",
  warehouseId: "w1",
  docDate: "2026-07-20",
  docNumber: null,
  notes: "",
  status: "draft",
  lines: [],
  ...over,
});

test("activeDeliveryFilters lists only filters that carry a value", () => {
  expect(activeDeliveryFilters({})).toEqual([]);
  expect(activeDeliveryFilters({ status: "posted" })).toEqual(["status"]);
  expect(activeDeliveryFilters({ status: "", warehouse: "w1" })).toEqual([
    "warehouse",
  ]);
});

test("deliveryToDocRow maps to the shared row with no total", () => {
  const row = deliveryToDocRow(
    delivery({
      id: "d1",
      docNumber: "DO-2026-0001",
      status: "posted",
      customerId: "c1",
      warehouseId: "w1",
    }),
    [customer("c1", "Toko Maju")],
    [warehouse("w1", "GD-01")],
  );
  expect(row).toEqual({
    id: "d1",
    number: "DO-2026-0001",
    date: "2026-07-20",
    counterparty: "Toko Maju",
    warehouse: "GD-01",
    total: null,
    status: "posted",
  });
});

test("deliveryToDocRow keeps number null for a draft", () => {
  const row = deliveryToDocRow(delivery(), [], []);
  expect(row.number).toBeNull();
  expect(row.status).toBe("draft");
});

test("deliveryTotalQty sums line quantities, ignoring non-numeric", () => {
  expect(deliveryTotalQty([{ qty: "3" }, { qty: "4.5" }])).toBe(7.5);
  expect(deliveryTotalQty([{ qty: "2" }, { qty: "" }])).toBe(2);
  expect(deliveryTotalQty([])).toBe(0);
});

test("filterDeliveries filters by status and warehouse", () => {
  const rows = [
    delivery({ id: "a", status: "draft", warehouseId: "w1" }),
    delivery({ id: "b", status: "posted", warehouseId: "w1" }),
    delivery({ id: "c", status: "posted", warehouseId: "w2" }),
  ];
  expect(filterDeliveries(rows, {}).map((d) => d.id)).toEqual(["a", "b", "c"]);
  expect(filterDeliveries(rows, { status: "posted" }).map((d) => d.id)).toEqual(
    ["b", "c"],
  );
  expect(
    filterDeliveries(rows, { status: "posted", warehouse: "w2" }).map(
      (d) => d.id,
    ),
  ).toEqual(["c"]);
});

test("deliveryLinesToGrid resolves products and drops unknown ones", () => {
  const lines: Delivery["lines"] = [
    { id: "l1", lineNo: 1, productId: "p1", qty: "5", uom: "pcs" },
    { id: "l2", lineNo: 2, productId: "gone", qty: "2", uom: "pcs" },
  ];
  const grid = deliveryLinesToGrid(lines, [product("p1")]);
  expect(grid).toEqual([{ key: "l1", product: product("p1"), qty: "5" }]);
});

test("gridToDeliveryLines maps qty/uom and threads salesOrderLineId", () => {
  const lines: GridLine[] = [
    { key: "k1", product: product("p1"), qty: "5" },
    { key: "k2", product: product("p2"), qty: "3" },
  ];
  expect(gridToDeliveryLines(lines, { k1: "so-line-1" })).toEqual([
    { productId: "p1", uom: "pcs", qty: "5", salesOrderLineId: "so-line-1" },
    { productId: "p2", uom: "pcs", qty: "3" },
  ]);
});

test("salesOrderToDraftSeed prefills customer, warehouse and lines from a SO", () => {
  const order: SalesOrder = {
    id: "so1",
    customerId: "c9",
    warehouseId: "w9",
    docDate: "2026-07-19",
    docNumber: "SO-2026-0001",
    notes: "",
    status: "posted",
    lines: [
      {
        id: "sl1",
        lineNo: 1,
        productId: "p1",
        qty: "10",
        unitPrice: "1000",
        uom: "pcs",
      },
      {
        id: "sl2",
        lineNo: 2,
        productId: "missing",
        qty: "4",
        unitPrice: "500",
        uom: "pcs",
      },
    ],
  };
  const seed = salesOrderToDraftSeed(order, [product("p1")]);
  expect(seed.customerId).toBe("c9");
  expect(seed.warehouseId).toBe("w9");
  expect(seed.lines).toEqual([
    { key: "sl1", product: product("p1"), qty: "10" },
  ]);
  expect(seed.salesOrderLineIds).toEqual({ sl1: "sl1" });
});

const gridLine = (id: string, qty: string): GridLine => ({
  key: id,
  product: product(id),
  qty,
});

test("draftBlockReason names the first missing prerequisite for posting", () => {
  const lines = [gridLine("p1", "5")];
  expect(
    draftBlockReason({ customerId: "", warehouseId: "w1", lines }),
  ).not.toBeNull();
  expect(
    draftBlockReason({ customerId: "c1", warehouseId: "", lines }),
  ).not.toBeNull();
  expect(
    draftBlockReason({ customerId: "c1", warehouseId: "w1", lines: [] }),
  ).not.toBeNull();
  expect(
    draftBlockReason({
      customerId: "c1",
      warehouseId: "w1",
      lines: [gridLine("p1", "0")],
    }),
  ).not.toBeNull();
});

test("draftBlockReason returns null when the draft is postable", () => {
  expect(
    draftBlockReason({
      customerId: "c1",
      warehouseId: "w1",
      lines: [gridLine("p1", "5")],
    }),
  ).toBeNull();
});
