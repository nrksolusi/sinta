import type { DocRow } from "@/components/doc-list";
import type { GridLine } from "@/components/line-grid";
import type { components } from "@/lib/api-types";

type GoodsReceipt = components["schemas"]["GoodsReceipt"];
type PurchaseOrder = components["schemas"]["PurchaseOrder"];
type PurchaseOrderInput = components["schemas"]["PurchaseOrderInput"];
type PurchaseOrderLine = components["schemas"]["PurchaseOrderLine"];
type Product = components["schemas"]["Product"];

// The editable draft state shared by /new and /$id (draft). Numbers are numeric
// strings throughout (never floats). A PO carries an ordered qty and unit cost
// per line, so the grid runs withCost.
export interface OrderDraft {
  supplierId: string;
  warehouseId: string;
  docDate: string;
  notes: string;
  lines: GridLine[];
}

// Raw URL search params for the list route. Empty strings mean "no filter".
export interface OrderSearch {
  status: string;
  warehouse: string;
  tanggal: string;
}

// Sum of qty*unitCost across a PO's lines, as a numeric string (never a float
// at rest). Ordered qty and cost are numeric strings; we parse, multiply, and
// re-stringify so the DocList total column renders through formatCurrency.
function orderTotal(po: PurchaseOrder): string {
  let total = 0;
  for (const line of po.lines) {
    total += Number(line.qty) * Number(line.unitCost);
  }
  return String(total);
}

// Map a PO to a shared DocRow. Unlike receipts, a PO carries a monetary total
// (ordered qty x unit cost), so total is populated and renders as currency.
export function purchaseOrderToDocRow(
  po: PurchaseOrder,
  opts: {
    supplierName: (supplierId: string) => string;
    warehouseCode: (warehouseId: string) => string;
  },
): DocRow {
  return {
    id: po.id,
    number: po.docNumber ?? null,
    date: po.docDate,
    counterparty: opts.supplierName(po.supplierId),
    warehouse: opts.warehouseCode(po.warehouseId),
    total: orderTotal(po),
    status: po.status,
  };
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `order-line-${keySeq}`;
}

// Rebuild an editable grid line from a saved PO line (draft resume). Lines whose
// product is unknown (archived / missing from the picker list) return null and
// are dropped by the caller rather than rendered without a name.
export function gridLineFromPoLine(
  line: PurchaseOrderLine,
  lookupProduct: (productId: string) => Product | undefined,
): GridLine | null {
  const product = lookupProduct(line.productId);
  if (!product) return null;
  return {
    key: nextKey(),
    product,
    qty: line.qty,
    cost: line.unitCost,
  };
}

// Draft -> wire payload. Empty notes is omitted (patch semantics); an empty unit
// cost is dropped so the server applies its default.
export function draftToPayload(draft: OrderDraft): PurchaseOrderInput {
  const payload: PurchaseOrderInput = {
    supplierId: draft.supplierId,
    warehouseId: draft.warehouseId,
    docDate: draft.docDate,
    lines: draft.lines.map((line) => ({
      productId: line.product.id,
      uom: line.product.baseUom,
      qty: line.qty,
      ...(line.cost?.trim() ? { unitCost: line.cost } : {}),
    })),
  };
  if (draft.notes.trim()) payload.notes = draft.notes;
  return payload;
}

// URL search params -> DocList filter state (only populated filters).
export function orderFilterState(search: OrderSearch): {
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

// ---- THE FULFILLMENT JOIN (client-side; no server rollup yet - INC-4) --------

// Whether a goods receipt contributes to received quantity. Only a posted
// receipt moves stock; drafts are not yet real and a reversed receipt has had
// its stock returned, so neither counts toward "Diterima".
function countsAsReceived(gr: GoodsReceipt): boolean {
  return gr.status === "posted";
}

// Sum posted receipt-line qty per purchaseOrderLineId, restricted to receipts
// that link back to this PO. This is the join the server does not yet provide:
// received quantity is reconstructed on the client from the receipt documents.
export function receivedByPoLine(
  purchaseOrderId: string,
  receipts: GoodsReceipt[],
): Map<string, number> {
  const received = new Map<string, number>();
  for (const gr of receipts) {
    if (gr.purchaseOrderId !== purchaseOrderId) continue;
    if (!countsAsReceived(gr)) continue;
    for (const line of gr.lines) {
      const poLineId = line.purchaseOrderLineId;
      if (!poLineId) continue;
      received.set(poLineId, (received.get(poLineId) ?? 0) + Number(line.qty));
    }
  }
  return received;
}

// One row of the posted-PO chain table: ordered vs received vs remaining.
export interface FulfillmentRow {
  poLineId: string;
  lineNo: number;
  productName: string;
  productCode: string;
  ordered: number;
  received: number;
  // Ordered minus received, clamped at zero (over-receipt is allowed and shows
  // as fully received rather than a negative remainder).
  remaining: number;
  unitCost: string;
}

// Join a PO's ordered lines with received quantities from its linked receipts.
export function fulfillmentRows(
  po: PurchaseOrder,
  receipts: GoodsReceipt[],
  lookupProduct: (productId: string) => Product | undefined,
): FulfillmentRow[] {
  const received = receivedByPoLine(po.id, receipts);
  return po.lines.map((line) => {
    const product = lookupProduct(line.productId);
    const ordered = Number(line.qty);
    const got = received.get(line.id) ?? 0;
    return {
      poLineId: line.id,
      lineNo: line.lineNo,
      productName: product?.name ?? line.productId,
      productCode: product?.sku ?? "",
      ordered,
      received: got,
      remaining: Math.max(0, ordered - got),
      unitCost: line.unitCost,
    };
  });
}

// Count of fully-received lines over total lines, for the list progress column
// ("3/5 diterima"). A line is fully received once received >= ordered.
export function poReceivedProgress(
  po: PurchaseOrder,
  receipts: GoodsReceipt[],
): { received: number; total: number } {
  const received = receivedByPoLine(po.id, receipts);
  let done = 0;
  for (const line of po.lines) {
    const got = received.get(line.id) ?? 0;
    if (got >= Number(line.qty)) done += 1;
  }
  return { received: done, total: po.lines.length };
}

// Receipts linked to this PO (any status), newest docDate first. Drafts are
// included so an in-progress receipt is visible from the source document.
export function linkedReceipts(
  purchaseOrderId: string,
  receipts: GoodsReceipt[],
): GoodsReceipt[] {
  return receipts
    .filter((gr) => gr.purchaseOrderId === purchaseOrderId)
    .sort(
      (a, b) => new Date(b.docDate).getTime() - new Date(a.docDate).getTime(),
    );
}
