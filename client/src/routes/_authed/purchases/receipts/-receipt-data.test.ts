import { expect, test } from "vitest";
import type { GridLine } from "@/components/line-grid";
import type { components } from "@/lib/api-types";
import type { ReceiptDraft } from "./-receipt-data";
import {
  draftToPayload,
  gridLineFromReceiptLine,
  poToDraftLines,
  receiptFilterState,
  receiptToDocRow,
  sortReceipts,
} from "./-receipt-data";

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

// ---- receiptToDocRow ---------------------------------------------------------

test("receiptToDocRow maps a posted receipt to a DocRow with supplier + warehouse names", () => {
  const gr: GoodsReceipt = {
    id: "gr-1",
    docNumber: "GR-2026-0001",
    docDate: "2026-07-10",
    status: "posted",
    supplierId: "sup-1",
    warehouseId: "wh-1",
    notes: "",
    lines: [],
  };
  const row = receiptToDocRow(gr, {
    supplierName: () => "PT Maju",
    warehouseCode: () => "GD-01",
  });
  expect(row).toEqual({
    id: "gr-1",
    number: "GR-2026-0001",
    date: "2026-07-10",
    counterparty: "PT Maju",
    warehouse: "GD-01",
    total: null,
    status: "posted",
  });
});

test("receiptToDocRow leaves number null for a draft", () => {
  const gr: GoodsReceipt = {
    id: "gr-2",
    docDate: "2026-07-11",
    status: "draft",
    supplierId: "sup-1",
    warehouseId: "wh-1",
    notes: "",
    lines: [],
  };
  const row = receiptToDocRow(gr, {
    supplierName: () => "PT Maju",
    warehouseCode: () => "GD-01",
  });
  expect(row.number).toBeNull();
});

// ---- sortReceipts ------------------------------------------------------------

test("sortReceipts filters by status, warehouse and date, drafts first then newest", () => {
  const receipts: GoodsReceipt[] = [
    {
      id: "a",
      docNumber: "GR-1",
      docDate: "2026-07-10",
      status: "posted",
      supplierId: "s",
      warehouseId: "wh-1",
      notes: "",
      lines: [],
    },
    {
      id: "b",
      docDate: "2026-07-05",
      status: "draft",
      supplierId: "s",
      warehouseId: "wh-1",
      notes: "",
      lines: [],
    },
    {
      id: "c",
      docNumber: "GR-2",
      docDate: "2026-07-12",
      status: "posted",
      supplierId: "s",
      warehouseId: "wh-2",
      notes: "",
      lines: [],
    },
  ];

  // No filters: draft first, then newest posted (c on 07-12 before a on 07-10).
  expect(sortReceipts(receipts, {}).map((r) => r.id)).toEqual(["b", "c", "a"]);

  // Status filter.
  expect(sortReceipts(receipts, { status: "draft" }).map((r) => r.id)).toEqual([
    "b",
  ]);

  // Warehouse filter.
  expect(
    sortReceipts(receipts, { warehouse: "wh-2" }).map((r) => r.id),
  ).toEqual(["c"]);

  // Date filter (exact docDate match).
  expect(
    sortReceipts(receipts, { dateRange: "2026-07-10" }).map((r) => r.id),
  ).toEqual(["a"]);
});

// ---- poToDraftLines ----------------------------------------------------------

test("poToDraftLines prefills grid lines from PO lines with purchaseOrderLineId and ordered qty", () => {
  const po: PurchaseOrder = {
    id: "po-1",
    docNumber: "PO-2026-0001",
    docDate: "2026-07-01",
    status: "posted",
    supplierId: "sup-1",
    warehouseId: "wh-1",
    notes: "",
    lines: [
      {
        id: "pol-1",
        lineNo: 1,
        productId: "prod-1",
        qty: "10",
        unitCost: "2500",
        uom: "pcs",
      },
      {
        id: "pol-2",
        lineNo: 2,
        productId: "prod-2",
        qty: "4",
        unitCost: "0",
        uom: "pcs",
      },
    ],
  };

  const lines = poToDraftLines(po, lookup);
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatchObject({
    product: { id: "prod-1" },
    qty: "10",
    cost: "2500",
    purchaseOrderLineId: "pol-1",
  });
  expect(lines[1]).toMatchObject({
    product: { id: "prod-2" },
    qty: "4",
    cost: "0",
    purchaseOrderLineId: "pol-2",
  });
  // Distinct keys so LineGrid can track rows.
  expect(lines[0].key).not.toEqual(lines[1].key);
});

test("poToDraftLines skips lines whose product is unknown", () => {
  const po: PurchaseOrder = {
    id: "po-2",
    docDate: "2026-07-01",
    status: "posted",
    supplierId: "sup-1",
    warehouseId: "wh-1",
    notes: "",
    lines: [
      {
        id: "pol-x",
        lineNo: 1,
        productId: "missing",
        qty: "1",
        unitCost: "1",
        uom: "pcs",
      },
    ],
  };
  expect(poToDraftLines(po, lookup)).toEqual([]);
});

// ---- gridLineFromReceiptLine -------------------------------------------------

test("gridLineFromReceiptLine rebuilds a grid line from a saved receipt line", () => {
  const line: components["schemas"]["GoodsReceiptLine"] = {
    id: "grl-1",
    lineNo: 1,
    productId: "prod-1",
    qty: "7",
    unitCost: "3000",
    uom: "pcs",
    purchaseOrderLineId: "pol-9",
  };
  const grid = gridLineFromReceiptLine(line, lookup);
  expect(grid).toMatchObject({
    product: { id: "prod-1" },
    qty: "7",
    cost: "3000",
    purchaseOrderLineId: "pol-9",
  });
});

test("gridLineFromReceiptLine returns null for an unknown product", () => {
  const line: components["schemas"]["GoodsReceiptLine"] = {
    id: "grl-2",
    lineNo: 1,
    productId: "missing",
    qty: "1",
    unitCost: "1",
    uom: "pcs",
  };
  expect(gridLineFromReceiptLine(line, lookup)).toBeNull();
});

// ---- draftToPayload ----------------------------------------------------------

const gridLine = (
  key: string,
  productId: string,
  qty: string,
  cost: string,
  purchaseOrderLineId?: string,
): GridLine & { purchaseOrderLineId?: string } => ({
  key,
  product: productsById.get(productId) as Product,
  qty,
  cost,
  purchaseOrderLineId,
});

test("draftToPayload builds a GoodsReceiptInput preserving purchaseOrderLineId and omitting empty notes", () => {
  const draft: ReceiptDraft = {
    supplierId: "sup-1",
    warehouseId: "wh-1",
    docDate: "2026-07-10",
    notes: "",
    purchaseOrderId: "po-1",
    lines: [
      gridLine("k1", "prod-1", "10", "2500", "pol-1"),
      gridLine("k2", "prod-2", "3", "", undefined),
    ],
  };
  const payload = draftToPayload(draft);
  expect(payload).toEqual({
    supplierId: "sup-1",
    warehouseId: "wh-1",
    docDate: "2026-07-10",
    purchaseOrderId: "po-1",
    lines: [
      {
        productId: "prod-1",
        uom: "pcs",
        qty: "10",
        unitCost: "2500",
        purchaseOrderLineId: "pol-1",
      },
      {
        productId: "prod-2",
        uom: "pcs",
        qty: "3",
      },
    ],
  });
  expect("notes" in payload).toBe(false);
});

test("draftToPayload includes notes when present and drops the PO id when absent", () => {
  const draft: ReceiptDraft = {
    supplierId: "sup-1",
    warehouseId: "wh-1",
    docDate: "2026-07-10",
    notes: "kirim pagi",
    purchaseOrderId: null,
    lines: [gridLine("k1", "prod-1", "1", "100")],
  };
  const payload = draftToPayload(draft);
  expect(payload.notes).toBe("kirim pagi");
  expect("purchaseOrderId" in payload).toBe(false);
});

// ---- receiptFilterState ------------------------------------------------------

test("receiptFilterState round-trips only the populated filters", () => {
  expect(
    receiptFilterState({ status: "draft", warehouse: "", tanggal: "" }),
  ).toEqual({
    status: "draft",
  });
  expect(
    receiptFilterState({
      status: "",
      warehouse: "wh-1",
      tanggal: "2026-07-10",
    }),
  ).toEqual({ warehouse: "wh-1", dateRange: "2026-07-10" });
});
