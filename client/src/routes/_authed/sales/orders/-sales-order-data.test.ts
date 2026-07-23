import { expect, test } from "vitest";
import type { GridLine } from "@/components/line-grid";
import type { Partner, Product, Warehouse } from "@/lib/pickers-data";
import {
  activeSalesOrderFilters,
  type Delivery,
  deliveredByLine,
  deliveryProgress,
  gridToSalesOrderLines,
  lineFulfillment,
  type SalesOrder,
  salesOrderDraftBlockReason,
  salesOrderLinesToGrid,
  salesOrderToDocRow,
  salesOrderTotal,
} from "./-sales-order-data";

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

const soLine = (
  id: string,
  productId: string,
  qty: string,
  unitPrice: string,
): SalesOrder["lines"][number] => ({
  id,
  lineNo: 1,
  productId,
  qty,
  unitPrice,
  uom: "pcs",
});

const order = (over: Partial<SalesOrder> = {}): SalesOrder => ({
  id: "so1",
  customerId: "c1",
  warehouseId: "w1",
  docDate: "2026-07-20",
  docNumber: null,
  notes: "",
  status: "draft",
  lines: [],
  createdAt: "2026-07-20T00:00:00Z",
  createdBy: { id: "u1", displayName: "Test User" },
  ...over,
});

const delivery = (over: Partial<Delivery> = {}): Delivery => ({
  id: "d1",
  customerId: "c1",
  warehouseId: "w1",
  docDate: "2026-07-21",
  docNumber: "DO-2026-0001",
  notes: "",
  status: "posted",
  salesOrderId: "so1",
  lines: [],
  createdAt: "2026-07-20T00:00:00Z",
  createdBy: { id: "u1", displayName: "Test User" },
  ...over,
});

test("activeSalesOrderFilters lists only filters that carry a value", () => {
  expect(activeSalesOrderFilters({})).toEqual([]);
  expect(activeSalesOrderFilters({ status: "posted" })).toEqual(["status"]);
  expect(activeSalesOrderFilters({ status: "", warehouse: "w1" })).toEqual([
    "warehouse",
  ]);
});

test("salesOrderToDocRow maps to the shared row with the order total", () => {
  const row = salesOrderToDocRow(
    order({
      id: "so1",
      docNumber: "SO-2026-0001",
      status: "posted",
      customerId: "c1",
      warehouseId: "w1",
      lines: [soLine("l1", "p1", "10", "1000"), soLine("l2", "p2", "2", "500")],
    }),
    [customer("c1", "Toko Maju")],
    [warehouse("w1", "GD-01")],
  );
  expect(row).toEqual({
    id: "so1",
    number: "SO-2026-0001",
    date: "2026-07-20",
    counterparty: "Toko Maju",
    warehouse: "GD-01",
    total: 11000,
    status: "posted",
  });
});

test("salesOrderToDocRow keeps number null for a draft", () => {
  const row = salesOrderToDocRow(order(), [], []);
  expect(row.number).toBeNull();
  expect(row.status).toBe("draft");
});

test("salesOrderTotal sums qty * unitPrice, ignoring non-numeric", () => {
  expect(
    salesOrderTotal([
      soLine("a", "p1", "10", "1000"),
      soLine("b", "p2", "2", "500"),
    ]),
  ).toBe(11000);
  expect(salesOrderTotal([soLine("a", "p1", "3", "")])).toBe(0);
  expect(salesOrderTotal([])).toBe(0);
});

test("salesOrderLinesToGrid resolves products, carries price, drops unknown", () => {
  const lines: SalesOrder["lines"] = [
    soLine("l1", "p1", "5", "1000"),
    soLine("l2", "gone", "2", "500"),
  ];
  const grid = salesOrderLinesToGrid(lines, [product("p1")]);
  expect(grid).toEqual([
    { key: "l1", product: product("p1"), qty: "5", cost: "1000" },
  ]);
});

test("gridToSalesOrderLines maps productId/uom/qty and unit price from cost", () => {
  const lines: GridLine[] = [
    { key: "k1", product: product("p1"), qty: "5", cost: "1000" },
    { key: "k2", product: product("p2"), qty: "3", cost: "" },
  ];
  expect(gridToSalesOrderLines(lines)).toEqual([
    { productId: "p1", uom: "pcs", qty: "5", unitPrice: "1000" },
    { productId: "p2", uom: "pcs", qty: "3" },
  ]);
});

// --- THE CHAIN: client-side fulfillment join (INC-4) --------------------------

test("deliveredByLine sums posted-delivery qty keyed by salesOrderLineId", () => {
  const deliveries = [
    delivery({
      id: "d1",
      status: "posted",
      lines: [
        {
          id: "dl1",
          lineNo: 1,
          productId: "p1",
          qty: "40",
          uom: "pcs",
          salesOrderLineId: "l1",
        },
      ],
    }),
    delivery({
      id: "d2",
      status: "posted",
      lines: [
        {
          id: "dl2",
          lineNo: 1,
          productId: "p1",
          qty: "36",
          uom: "pcs",
          salesOrderLineId: "l1",
        },
        {
          id: "dl3",
          lineNo: 2,
          productId: "p2",
          qty: "5",
          uom: "pcs",
          salesOrderLineId: "l2",
        },
      ],
    }),
  ];
  const byLine = deliveredByLine(deliveries);
  expect(byLine.get("l1")).toBe(76);
  expect(byLine.get("l2")).toBe(5);
});

test("deliveredByLine ignores drafts, reversals, and unlinked lines", () => {
  const deliveries = [
    delivery({
      id: "d1",
      status: "draft",
      lines: [
        {
          id: "dl1",
          lineNo: 1,
          productId: "p1",
          qty: "10",
          uom: "pcs",
          salesOrderLineId: "l1",
        },
      ],
    }),
    delivery({
      id: "d2",
      status: "reversed",
      lines: [
        {
          id: "dl2",
          lineNo: 1,
          productId: "p1",
          qty: "10",
          uom: "pcs",
          salesOrderLineId: "l1",
        },
      ],
    }),
    delivery({
      id: "d3",
      status: "posted",
      lines: [{ id: "dl3", lineNo: 1, productId: "p1", qty: "7", uom: "pcs" }],
    }),
  ];
  expect(deliveredByLine(deliveries).get("l1")).toBeUndefined();
});

test("lineFulfillment reports ordered, delivered and remaining per line", () => {
  const so = order({
    id: "so1",
    status: "posted",
    lines: [
      soLine("l1", "p1", "100", "98000"),
      soLine("l2", "p2", "20", "5000"),
    ],
  });
  const deliveries = [
    delivery({
      id: "d1",
      status: "posted",
      lines: [
        {
          id: "dl1",
          lineNo: 1,
          productId: "p1",
          qty: "76",
          uom: "pcs",
          salesOrderLineId: "l1",
        },
      ],
    }),
  ];
  const rows = lineFulfillment(so, deliveries);
  expect(rows).toEqual([
    { lineId: "l1", ordered: 100, delivered: 76, remaining: 24 },
    { lineId: "l2", ordered: 20, delivered: 0, remaining: 20 },
  ]);
});

test("lineFulfillment clamps remaining at zero on over-delivery", () => {
  const so = order({
    id: "so1",
    status: "posted",
    lines: [soLine("l1", "p1", "10", "100")],
  });
  const deliveries = [
    delivery({
      id: "d1",
      status: "posted",
      lines: [
        {
          id: "dl1",
          lineNo: 1,
          productId: "p1",
          qty: "12",
          uom: "pcs",
          salesOrderLineId: "l1",
        },
      ],
    }),
  ];
  expect(lineFulfillment(so, deliveries)[0].remaining).toBe(0);
});

test("deliveryProgress counts lines fully delivered over total lines", () => {
  const so = order({
    id: "so1",
    status: "posted",
    lines: [soLine("l1", "p1", "10", "100"), soLine("l2", "p2", "5", "100")],
  });
  const partly = [
    delivery({
      id: "d1",
      status: "posted",
      lines: [
        {
          id: "dl1",
          lineNo: 1,
          productId: "p1",
          qty: "10",
          uom: "pcs",
          salesOrderLineId: "l1",
        },
      ],
    }),
  ];
  expect(deliveryProgress(so, partly)).toEqual({ delivered: 1, total: 2 });
  expect(deliveryProgress(so, [])).toEqual({ delivered: 0, total: 2 });
  expect(deliveryProgress(order({ lines: [] }), [])).toEqual({
    delivered: 0,
    total: 0,
  });
});

test("deliveryProgress only considers deliveries linked to this order", () => {
  const so = order({
    id: "so1",
    status: "posted",
    lines: [soLine("l1", "p1", "10", "100")],
  });
  const other = [
    delivery({
      id: "d1",
      salesOrderId: "OTHER",
      status: "posted",
      lines: [
        {
          id: "dl1",
          lineNo: 1,
          productId: "p1",
          qty: "10",
          uom: "pcs",
          salesOrderLineId: "l1",
        },
      ],
    }),
  ];
  expect(deliveryProgress(so, other)).toEqual({ delivered: 0, total: 1 });
});

const gridLine = (id: string, qty: string): GridLine => ({
  key: id,
  product: product(id),
  qty,
  cost: "100",
});

test("salesOrderDraftBlockReason names the first missing prerequisite", () => {
  const lines = [gridLine("p1", "5")];
  expect(
    salesOrderDraftBlockReason({ customerId: "", warehouseId: "w1", lines }),
  ).not.toBeNull();
  expect(
    salesOrderDraftBlockReason({ customerId: "c1", warehouseId: "", lines }),
  ).not.toBeNull();
  expect(
    salesOrderDraftBlockReason({
      customerId: "c1",
      warehouseId: "w1",
      lines: [],
    }),
  ).not.toBeNull();
  expect(
    salesOrderDraftBlockReason({
      customerId: "c1",
      warehouseId: "w1",
      lines: [gridLine("p1", "0")],
    }),
  ).not.toBeNull();
});

test("salesOrderDraftBlockReason returns null when the draft is postable", () => {
  expect(
    salesOrderDraftBlockReason({
      customerId: "c1",
      warehouseId: "w1",
      lines: [gridLine("p1", "5")],
    }),
  ).toBeNull();
});
