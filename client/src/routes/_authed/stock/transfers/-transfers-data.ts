import type { DocRow } from "@/components/doc-list";
import type { GridLine } from "@/components/line-grid";
import type { TimelineEntry } from "@/components/record-shell";
import type { components } from "@/lib/api-types";
import type { Product } from "@/lib/pickers-data";

export type StockTransfer = components["schemas"]["StockTransfer"];
export type StockTransferInput = components["schemas"]["StockTransferInput"];
export type StockTransferLine = components["schemas"]["StockTransferLine"];

// URL-backed list filters. Warehouse is matched against either side of the
// transfer (Dari or Ke), by warehouse code.
export interface TransferFilters {
  status?: string;
  warehouse?: string;
}

// A transfer never has a partner; the counterparty column carries the
// Dari -> Ke route instead (fix-2 prototype D1, transfer variant). The Gudang
// column shows the source (Dari) warehouse. Total is the line-quantity sum, so
// DocList renders qty rather than money for transfers.
export interface TransferDocRow extends DocRow {
  fromCode: string;
  toCode: string;
}

// Whole numbers of active/valid quantities: blank and non-numeric qty are 0.
export function transferTotalQty(lines: Array<{ qty: string }>): number {
  let total = 0;
  for (const line of lines) {
    const qty = Number(line.qty);
    if (!Number.isNaN(qty)) total += qty;
  }
  return total;
}

// True only when both warehouses are chosen and identical - the one transfer
// rule the client enforces before saving (source and destination must differ).
export function sameWarehouse(
  fromWarehouseId: string,
  toWarehouseId: string,
): boolean {
  return (
    fromWarehouseId !== "" &&
    toWarehouseId !== "" &&
    fromWarehouseId === toWarehouseId
  );
}

// `formatRoute` renders the "Dari -> Ke" cell; the caller passes the Paraglide
// message so this module stays free of the message runtime and unit-testable.
export function transferDocRows(
  transfers: StockTransfer[],
  warehouseName: (warehouseId: string) => string,
  formatRoute: (from: string, to: string) => string,
): TransferDocRow[] {
  return transfers.map((tr) => {
    const fromCode = warehouseName(tr.fromWarehouseId);
    const toCode = warehouseName(tr.toWarehouseId);
    return {
      id: tr.id,
      number: tr.docNumber ?? null,
      date: tr.docDate,
      counterparty: formatRoute(fromCode, toCode),
      warehouse: fromCode,
      total: transferTotalQty(tr.lines),
      status: tr.status,
      fromCode,
      toCode,
    };
  });
}

export interface TransferFormState {
  fromWarehouseId: string;
  toWarehouseId: string;
  docDate: string;
  notes: string;
  lines: GridLine[];
}

// Build the create/update body. Notes are dropped when blank so the server sees
// no field rather than an empty string.
export function toTransferInput(state: TransferFormState): StockTransferInput {
  const notes = state.notes.trim();
  return {
    fromWarehouseId: state.fromWarehouseId,
    toWarehouseId: state.toWarehouseId,
    docDate: state.docDate,
    ...(notes ? { notes } : {}),
    lines: state.lines.map((line) => ({
      productId: line.product.id,
      uom: line.product.baseUom,
      qty: line.qty,
    })),
  };
}

// The restated specifics a posting confirm needs (ConfirmDialog specifics prop
// is required, UX-D2/D7): "Posting transfer {N} baris, total qty {X},
// {dari} -> {ke}?".
export interface PostConfirmData {
  lineCount: number;
  totalQty: number;
  fromName: string;
  toName: string;
}

export function postConfirmSpecifics(input: {
  lines: GridLine[];
  fromName: string;
  toName: string;
}): PostConfirmData {
  return {
    lineCount: input.lines.length,
    totalQty: transferTotalQty(input.lines),
    fromName: input.fromName,
    toName: input.toName,
  };
}

// Hydrate a saved transfer's lines into editable grid lines, resolving each
// productId to the full Product record. Lines whose product is missing (e.g.
// archived and dropped from the active list) are skipped rather than rendered
// blank.
let hydrateSeq = 0;
export function transferLinesToGrid(
  lines: StockTransferLine[],
  productsById: Map<string, Product>,
): GridLine[] {
  const grid: GridLine[] = [];
  for (const line of lines) {
    const product = productsById.get(line.productId);
    if (!product) continue;
    hydrateSeq += 1;
    grid.push({ key: `transfer-line-${hydrateSeq}`, product, qty: line.qty });
  }
  return grid;
}

export interface TimelineLabels {
  created: string;
  posted: string;
  reversed: string;
}

// The mini timeline (UX-D7). The list/get shape carries no actor or per-event
// timestamps yet, so entries anchor to docDate and the actor is left to the
// caller-supplied "-"; the ordering (created, posted, reversed) is what the
// timeline communicates. `posted` and `reversed` appear only in those states.
export function buildTransferTimeline(
  transfer: StockTransfer,
  labels: TimelineLabels,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { action: labels.created, actor: "-", at: transfer.docDate },
  ];
  if (transfer.status === "posted" || transfer.status === "reversed") {
    entries.push({ action: labels.posted, actor: "-", at: transfer.docDate });
  }
  if (transfer.status === "reversed") {
    entries.push({
      action: labels.reversed,
      actor: "-",
      at: transfer.docDate,
    });
  }
  return entries;
}
