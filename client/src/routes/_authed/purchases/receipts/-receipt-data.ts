import type { DocRow } from "@/components/doc-list";
import type { GridLine } from "@/components/line-grid";
import type { components } from "@/lib/api-types";

type GoodsReceipt = components["schemas"]["GoodsReceipt"];
type GoodsReceiptInput = components["schemas"]["GoodsReceiptInput"];
type GoodsReceiptLine = components["schemas"]["GoodsReceiptLine"];
type PurchaseOrder = components["schemas"]["PurchaseOrder"];
type Product = components["schemas"]["Product"];

// A receipt grid line carries the source PO line so short-receipt links survive
// the create-from-PO round-trip (task 2.1 contract). It is a superset of the
// shared GridLine; LineGrid ignores the extra field.
export type ReceiptGridLine = GridLine & { purchaseOrderLineId?: string };

// The editable draft state shared by /new and /$id (draft). Numbers are
// numeric strings throughout (never floats).
export interface ReceiptDraft {
  supplierId: string;
  warehouseId: string;
  docDate: string;
  notes: string;
  // Set only when the draft originated from a PO (create-from-source contract).
  purchaseOrderId: string | null;
  lines: ReceiptGridLine[];
}

// Raw URL search params for the list route. Empty strings mean "no filter".
export interface ReceiptSearch {
  status: string;
  warehouse: string;
  tanggal: string;
}

// Map a receipt to a shared DocRow. Receipts carry no monetary total in their
// list shape, so total is always null and renders as "-" (see entity-documents).
export function receiptToDocRow(
  gr: GoodsReceipt,
  opts: {
    supplierName: (supplierId: string) => string;
    warehouseCode: (warehouseId: string) => string;
  },
): DocRow {
  return {
    id: gr.id,
    number: gr.docNumber ?? null,
    date: gr.docDate,
    counterparty: opts.supplierName(gr.supplierId),
    warehouse: opts.warehouseCode(gr.warehouseId),
    total: null,
    status: gr.status,
  };
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `receipt-line-${keySeq}`;
}

// Prefill grid lines from a source PO (create-from-source contract). Default qty
// is the ordered qty; short quantities are allowed and post short at M1. Each
// line keeps its purchaseOrderLineId. Lines whose product is unknown (archived /
// missing from the picker list) are skipped rather than rendered without a name.
export function poToDraftLines(
  po: PurchaseOrder,
  lookupProduct: (productId: string) => Product | undefined,
): ReceiptGridLine[] {
  const lines: ReceiptGridLine[] = [];
  for (const line of po.lines) {
    const product = lookupProduct(line.productId);
    if (!product) continue;
    lines.push({
      key: nextKey(),
      product,
      qty: line.qty,
      cost: line.unitCost,
      purchaseOrderLineId: line.id,
    });
  }
  return lines;
}

// Rebuild an editable grid line from a saved receipt line (draft resume).
export function gridLineFromReceiptLine(
  line: GoodsReceiptLine,
  lookupProduct: (productId: string) => Product | undefined,
): ReceiptGridLine | null {
  const product = lookupProduct(line.productId);
  if (!product) return null;
  return {
    key: nextKey(),
    product,
    qty: line.qty,
    cost: line.unitCost,
    ...(line.purchaseOrderLineId
      ? { purchaseOrderLineId: line.purchaseOrderLineId }
      : {}),
  };
}

// Draft -> wire payload. Empty notes and an absent PO id are omitted (patch
// semantics); an empty unit cost is dropped so the server applies its default.
export function draftToPayload(draft: ReceiptDraft): GoodsReceiptInput {
  const payload: GoodsReceiptInput = {
    supplierId: draft.supplierId,
    warehouseId: draft.warehouseId,
    docDate: draft.docDate,
    lines: draft.lines.map((line) => ({
      productId: line.product.id,
      uom: line.product.baseUom,
      qty: line.qty,
      ...(line.cost?.trim() ? { unitCost: line.cost } : {}),
      ...(line.purchaseOrderLineId
        ? { purchaseOrderLineId: line.purchaseOrderLineId }
        : {}),
    })),
  };
  if (draft.notes.trim()) payload.notes = draft.notes;
  if (draft.purchaseOrderId) payload.purchaseOrderId = draft.purchaseOrderId;
  return payload;
}

// URL search params -> DocList filter state (only populated filters). The list
// route owns the URL; DocList takes controlled filter state.
export function receiptFilterState(search: ReceiptSearch): {
  status?: string;
  warehouse?: string;
  dateRange?: string;
} {
  const filters: { status?: string; warehouse?: string; dateRange?: string } =
    {};
  if (search.status) filters.status = search.status;
  if (search.warehouse) filters.warehouse = search.warehouse;
  if (search.tanggal) filters.dateRange = search.tanggal;
  return filters;
}
