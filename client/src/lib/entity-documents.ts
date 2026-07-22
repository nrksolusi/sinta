import type { DocRow } from "@/components/doc-list";
import type { components } from "./api-types";

type PurchaseOrder = components["schemas"]["PurchaseOrder"];
type GoodsReceipt = components["schemas"]["GoodsReceipt"];
type SalesOrder = components["schemas"]["SalesOrder"];
type Delivery = components["schemas"]["Delivery"];

// The four document types an entity (partner or warehouse) touches on its
// detail page. Transfers/adjustments/opnames don't reference a partner and are
// out of scope for these two pages (fix-2 D7 tail).
export interface EntityDocumentSources {
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  salesOrders: SalesOrder[];
  deliveries: Delivery[];
}

// The four document-type labels, resolved by the caller from Paraglide so this
// module stays free of the message runtime and easy to unit-test.
export interface DocTypeLabels {
  purchaseOrder: string;
  goodsReceipt: string;
  salesOrder: string;
  delivery: string;
}

// Documents carry no monetary total in their list/get shape (see api-types),
// so DocRow.total is always null here and renders as "-".
function baseRow(
  id: string,
  docNumber: string | null | undefined,
  docDate: string,
  status: DocRow["status"],
  counterparty: string,
  warehouse: string,
): DocRow {
  return {
    id,
    number: docNumber ?? null,
    date: docDate,
    counterparty,
    warehouse,
    total: null,
    status,
  };
}

// Partner detail: their documents. PO and GR reference the partner as supplier;
// SO and delivery reference it as customer. The counterparty column repeats the
// partner on this page, so it shows the document-type label instead.
export function partnerDocRows(
  partnerId: string,
  sources: EntityDocumentSources,
  opts: {
    warehouseCode: (warehouseId: string) => string;
    label: DocTypeLabels;
  },
): DocRow[] {
  const { warehouseCode, label } = opts;
  const rows: DocRow[] = [];

  for (const po of sources.purchaseOrders) {
    if (po.supplierId === partnerId) {
      rows.push(
        baseRow(
          po.id,
          po.docNumber,
          po.docDate,
          po.status,
          label.purchaseOrder,
          warehouseCode(po.warehouseId),
        ),
      );
    }
  }
  for (const gr of sources.goodsReceipts) {
    if (gr.supplierId === partnerId) {
      rows.push(
        baseRow(
          gr.id,
          gr.docNumber,
          gr.docDate,
          gr.status,
          label.goodsReceipt,
          warehouseCode(gr.warehouseId),
        ),
      );
    }
  }
  for (const so of sources.salesOrders) {
    if (so.customerId === partnerId) {
      rows.push(
        baseRow(
          so.id,
          so.docNumber,
          so.docDate,
          so.status,
          label.salesOrder,
          warehouseCode(so.warehouseId),
        ),
      );
    }
  }
  for (const del of sources.deliveries) {
    if (del.customerId === partnerId) {
      rows.push(
        baseRow(
          del.id,
          del.docNumber,
          del.docDate,
          del.status,
          label.delivery,
          warehouseCode(del.warehouseId),
        ),
      );
    }
  }

  return rows;
}

// Warehouse detail: its documents. Every one of the four types carries a
// warehouseId; the counterparty column resolves to the partner name.
export function warehouseDocRows(
  warehouseId: string,
  sources: EntityDocumentSources,
  opts: { partnerName: (partnerId: string) => string; label: DocTypeLabels },
): DocRow[] {
  const { partnerName, label } = opts;
  const rows: DocRow[] = [];

  for (const po of sources.purchaseOrders) {
    if (po.warehouseId === warehouseId) {
      rows.push(
        baseRow(
          po.id,
          po.docNumber,
          po.docDate,
          po.status,
          partnerName(po.supplierId),
          label.purchaseOrder,
        ),
      );
    }
  }
  for (const gr of sources.goodsReceipts) {
    if (gr.warehouseId === warehouseId) {
      rows.push(
        baseRow(
          gr.id,
          gr.docNumber,
          gr.docDate,
          gr.status,
          partnerName(gr.supplierId),
          label.goodsReceipt,
        ),
      );
    }
  }
  for (const so of sources.salesOrders) {
    if (so.warehouseId === warehouseId) {
      rows.push(
        baseRow(
          so.id,
          so.docNumber,
          so.docDate,
          so.status,
          partnerName(so.customerId),
          label.salesOrder,
        ),
      );
    }
  }
  for (const del of sources.deliveries) {
    if (del.warehouseId === warehouseId) {
      rows.push(
        baseRow(
          del.id,
          del.docNumber,
          del.docDate,
          del.status,
          partnerName(del.customerId),
          label.delivery,
        ),
      );
    }
  }

  return rows;
}
