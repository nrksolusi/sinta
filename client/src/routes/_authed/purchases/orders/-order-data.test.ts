import { expect, test } from "vitest";
import type { GridLine } from "@/components/line-grid";
import type { components } from "@/lib/api-types";
import type { OrderDraft } from "./-order-data";
import {
  draftToPayload,
  fulfillmentRows,
  gridLineFromPoLine,
  linkedReceipts,
  orderFilterState,
  poReceivedProgress,
  purchaseOrderToDocRow,
  receivedByPoLine,
  sortPurchaseOrders,
} from "./-order-data";

type GoodsReceipt = components["schemas"]["GoodsReceipt"];
type PurchaseOrder = components["schemas"]["PurchaseOrder"];
type Product = components["schemas"]["Product"];

const product = (id: string, sku: string): Product => ({
  id,
  sku,
  name: `Produk ${sku}`,
  baseUom: "pcs",
  isBatchTracked: false,
  status: "active",
});

const productsById = new Map<string, Product>([
  ["prod-1", product("prod-1", "SKU-1")],
  ["prod-2", product("prod-2", "SKU-2")],
]);

const lookup = (id: string) => productsById.get(id);

const po = (overrides: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: "po-1",
  docNumber: "PO-2026-0008",
  docDate: "2026-07-15",
  status: "posted",
  supplierId: "sup-1",
  warehouseId: "wh-1",
  notes: "",
  createdAt: "2026-07-15T00:00:00Z",
  createdBy: { id: "u1", displayName: "Test User" },
  lines: [
    {
      id: "pol-1",
      lineNo: 1,
      productId: "prod-1",
      qty: "100",
      unitCost: "980",
      uom: "pcs",
    },
    {
      id: "pol-2",
      lineNo: 2,
      productId: "prod-2",
      qty: "5",
      unitCost: "2000",
      uom: "pcs",
    },
  ],
  ...overrides,
});

// ---- purchaseOrderToDocRow ---------------------------------------------------

test("purchaseOrderToDocRow maps a posted PO to a DocRow with a summed total", () => {
  const row = purchaseOrderToDocRow(po(), {
    supplierName: () => "PT Maju Jaya",
    warehouseCode: () => "GD-01",
  });
  expect(row).toEqual({
    id: "po-1",
    number: "PO-2026-0008",
    date: "2026-07-15",
    counterparty: "PT Maju Jaya",
    warehouse: "GD-01",
    // 100*980 + 5*2000 = 108000
    total: "108000",
    status: "posted",
  });
});

test("purchaseOrderToDocRow leaves number null for a draft", () => {
  const row = purchaseOrderToDocRow(po({ docNumber: null, status: "draft" }), {
    supplierName: () => "x",
    warehouseCode: () => "y",
  });
  expect(row.number).toBeNull();
});

// ---- sortPurchaseOrders ------------------------------------------------------

test("sortPurchaseOrders filters by status, warehouse and date, drafts first then newest", () => {
  const orders: PurchaseOrder[] = [
    po({ id: "a", docNumber: "PO-1", docDate: "2026-07-10", status: "posted" }),
    po({ id: "b", docNumber: null, docDate: "2026-07-05", status: "draft" }),
    po({
      id: "c",
      docNumber: "PO-2",
      docDate: "2026-07-12",
      status: "posted",
      warehouseId: "wh-2",
    }),
  ];

  expect(sortPurchaseOrders(orders, {}).map((o) => o.id)).toEqual([
    "b",
    "c",
    "a",
  ]);
  expect(
    sortPurchaseOrders(orders, { status: "draft" }).map((o) => o.id),
  ).toEqual(["b"]);
  expect(
    sortPurchaseOrders(orders, { warehouse: "wh-2" }).map((o) => o.id),
  ).toEqual(["c"]);
  expect(
    sortPurchaseOrders(orders, { dateRange: "2026-07-10" }).map((o) => o.id),
  ).toEqual(["a"]);
});

// ---- gridLineFromPoLine ------------------------------------------------------

test("gridLineFromPoLine rebuilds a grid line from a saved PO line", () => {
  const grid = gridLineFromPoLine(po().lines[0], lookup);
  expect(grid).toMatchObject({
    product: { id: "prod-1" },
    qty: "100",
    cost: "980",
  });
});

test("gridLineFromPoLine returns null for an unknown product", () => {
  const grid = gridLineFromPoLine(
    {
      id: "x",
      lineNo: 1,
      productId: "missing",
      qty: "1",
      unitCost: "1",
      uom: "pcs",
    },
    lookup,
  );
  expect(grid).toBeNull();
});

// ---- draftToPayload ----------------------------------------------------------

const gridLine = (
  key: string,
  productId: string,
  qty: string,
  cost: string,
): GridLine => ({
  key,
  product: productsById.get(productId) as Product,
  qty,
  cost,
});

test("draftToPayload builds a PurchaseOrderInput, omitting empty notes and empty cost", () => {
  const draft: OrderDraft = {
    supplierId: "sup-1",
    warehouseId: "wh-1",
    docDate: "2026-07-15",
    notes: "",
    lines: [
      gridLine("k1", "prod-1", "100", "980"),
      gridLine("k2", "prod-2", "5", ""),
    ],
  };
  const payload = draftToPayload(draft);
  expect(payload).toEqual({
    supplierId: "sup-1",
    warehouseId: "wh-1",
    docDate: "2026-07-15",
    lines: [
      { productId: "prod-1", uom: "pcs", qty: "100", unitCost: "980" },
      { productId: "prod-2", uom: "pcs", qty: "5" },
    ],
  });
  expect("notes" in payload).toBe(false);
});

test("draftToPayload includes notes when present", () => {
  const draft: OrderDraft = {
    supplierId: "sup-1",
    warehouseId: "wh-1",
    docDate: "2026-07-15",
    notes: "kirim cepat",
    lines: [gridLine("k1", "prod-1", "1", "100")],
  };
  expect(draftToPayload(draft).notes).toBe("kirim cepat");
});

// ---- orderFilterState --------------------------------------------------------

test("orderFilterState round-trips only the populated filters", () => {
  expect(
    orderFilterState({ status: "draft", warehouse: "", tanggal: "" }),
  ).toEqual({ status: "draft" });
  expect(
    orderFilterState({ status: "", warehouse: "wh-1", tanggal: "2026-07-10" }),
  ).toEqual({ warehouse: "wh-1", dateRange: "2026-07-10" });
});

// ---- receivedByPoLine (the fulfillment join) --------------------------------

const receipt = (
  overrides: Partial<GoodsReceipt> & {
    lines: GoodsReceipt["lines"];
  },
): GoodsReceipt => ({
  id: "gr-x",
  docNumber: "GR-x",
  docDate: "2026-07-19",
  status: "posted",
  supplierId: "sup-1",
  warehouseId: "wh-1",
  notes: "",
  purchaseOrderId: "po-1",
  createdAt: "2026-07-19T00:00:00Z",
  createdBy: { id: "u1", displayName: "Test User" },
  ...overrides,
});

test("receivedByPoLine sums posted receipt line qty per purchaseOrderLineId, only for this PO", () => {
  const receipts: GoodsReceipt[] = [
    receipt({
      id: "gr-1",
      lines: [
        {
          id: "l1",
          lineNo: 1,
          productId: "prod-1",
          qty: "40",
          unitCost: "980",
          uom: "pcs",
          purchaseOrderLineId: "pol-1",
        },
        {
          id: "l2",
          lineNo: 2,
          productId: "prod-2",
          qty: "5",
          unitCost: "2000",
          uom: "pcs",
          purchaseOrderLineId: "pol-2",
        },
      ],
    }),
    receipt({
      id: "gr-2",
      docNumber: "GR-2",
      lines: [
        {
          id: "l3",
          lineNo: 1,
          productId: "prod-1",
          qty: "36",
          unitCost: "980",
          uom: "pcs",
          purchaseOrderLineId: "pol-1",
        },
      ],
    }),
    // A draft receipt must NOT count toward received qty.
    receipt({
      id: "gr-draft",
      docNumber: null,
      status: "draft",
      lines: [
        {
          id: "l4",
          lineNo: 1,
          productId: "prod-1",
          qty: "999",
          unitCost: "980",
          uom: "pcs",
          purchaseOrderLineId: "pol-1",
        },
      ],
    }),
    // A receipt for a different PO must be ignored.
    receipt({
      id: "gr-other",
      purchaseOrderId: "po-other",
      lines: [
        {
          id: "l5",
          lineNo: 1,
          productId: "prod-1",
          qty: "7",
          unitCost: "980",
          uom: "pcs",
          purchaseOrderLineId: "pol-other",
        },
      ],
    }),
    // A reversed receipt must NOT count (its stock was returned).
    receipt({
      id: "gr-reversed",
      status: "reversed",
      lines: [
        {
          id: "l6",
          lineNo: 1,
          productId: "prod-2",
          qty: "3",
          unitCost: "2000",
          uom: "pcs",
          purchaseOrderLineId: "pol-2",
        },
      ],
    }),
  ];

  const received = receivedByPoLine("po-1", receipts);
  expect(received.get("pol-1")).toBe(76);
  expect(received.get("pol-2")).toBe(5);
  expect(received.has("pol-other")).toBe(false);
});

// ---- fulfillmentRows ---------------------------------------------------------

test("fulfillmentRows joins ordered qty with received qty and computes remaining", () => {
  const receipts: GoodsReceipt[] = [
    receipt({
      id: "gr-1",
      lines: [
        {
          id: "l1",
          lineNo: 1,
          productId: "prod-1",
          qty: "76",
          unitCost: "980",
          uom: "pcs",
          purchaseOrderLineId: "pol-1",
        },
      ],
    }),
  ];
  const rows = fulfillmentRows(po(), receipts, lookup);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    lineNo: 1,
    productName: "Produk SKU-1",
    ordered: 100,
    received: 76,
    remaining: 24,
    unitCost: "980",
  });
  // Nothing received against line 2 yet.
  expect(rows[1]).toMatchObject({
    lineNo: 2,
    ordered: 5,
    received: 0,
    remaining: 5,
  });
});

test("fulfillmentRows clamps remaining at zero when over-received", () => {
  const receipts: GoodsReceipt[] = [
    receipt({
      id: "gr-1",
      lines: [
        {
          id: "l1",
          lineNo: 1,
          productId: "prod-1",
          qty: "120",
          unitCost: "980",
          uom: "pcs",
          purchaseOrderLineId: "pol-1",
        },
      ],
    }),
  ];
  const rows = fulfillmentRows(po(), receipts, lookup);
  expect(rows[0].received).toBe(120);
  expect(rows[0].remaining).toBe(0);
});

// ---- poReceivedProgress ------------------------------------------------------

test("poReceivedProgress counts fully-received lines over total lines", () => {
  // pol-1 fully received (100/100), pol-2 not (0/5) -> 1 of 2.
  const receipts: GoodsReceipt[] = [
    receipt({
      id: "gr-1",
      lines: [
        {
          id: "l1",
          lineNo: 1,
          productId: "prod-1",
          qty: "100",
          unitCost: "980",
          uom: "pcs",
          purchaseOrderLineId: "pol-1",
        },
      ],
    }),
  ];
  expect(poReceivedProgress(po(), receipts)).toEqual({ received: 1, total: 2 });
});

test("poReceivedProgress is 0/0 for an empty PO", () => {
  expect(poReceivedProgress(po({ lines: [] }), [])).toEqual({
    received: 0,
    total: 0,
  });
});

// ---- linkedReceipts ----------------------------------------------------------

test("linkedReceipts returns receipts for this PO, newest first, drafts included", () => {
  const receipts: GoodsReceipt[] = [
    receipt({ id: "gr-1", docDate: "2026-07-19", lines: [] }),
    receipt({ id: "gr-3", docDate: "2026-07-21", lines: [] }),
    receipt({ id: "gr-other", purchaseOrderId: "po-other", lines: [] }),
  ];
  expect(linkedReceipts("po-1", receipts).map((r) => r.id)).toEqual([
    "gr-3",
    "gr-1",
  ]);
});
