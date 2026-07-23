import { queryOptions } from "@tanstack/react-query";
import type { DocRow } from "@/components/doc-list";
import type { GridLine } from "@/components/line-grid";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import type { Partner, Product, Warehouse } from "@/lib/pickers-data";

export type Delivery = components["schemas"]["Delivery"];

// All deliveries for the list (tenant-scoped by the session cookie). The server
// returns everything at M1; the DocList filter bar narrows client-side.
export const deliveriesQueryOptions = queryOptions({
  queryKey: ["deliveries"],
  queryFn: async (): Promise<Delivery[]> => {
    const { data } = await api.GET("/deliveries");
    return data?.items ?? [];
  },
});

export function deliveryQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["delivery", id],
    queryFn: async (): Promise<Delivery | null> => {
      const { data } = await api.GET("/deliveries/{id}", {
        params: { path: { id } },
      });
      return data ?? null;
    },
  });
}

export type DeliveryInput = components["schemas"]["DeliveryInput"];
export type DeliveryLineInput = components["schemas"]["DeliveryLineInput"];
export type SalesOrder = components["schemas"]["SalesOrder"];

// Client-side URL filter state for the delivery list. Mirrors DocListFilters
// (status / warehouse); date-range is reserved but not wired at M1. Lives in the
// route's search params (shareable, survives back-nav per UX-D10).
export interface DeliveryFilters {
  status?: string;
  warehouse?: string;
}

const FILTER_KEYS: (keyof DeliveryFilters)[] = ["status", "warehouse"];

// Which filters carry a value; drives the empty-state variant and chip bar.
export function activeDeliveryFilters(
  filters: DeliveryFilters,
): (keyof DeliveryFilters)[] {
  return FILTER_KEYS.filter((key) => {
    const value = filters[key];
    return value != null && value !== "";
  });
}

// Look up a display name by id, falling back to the id so a stale reference
// never renders blank.
function nameById<T extends { id: string; name: string }>(
  items: T[],
  id: string,
): string {
  return items.find((it) => it.id === id)?.name ?? id;
}

function warehouseLabel(warehouses: Warehouse[], id: string): string {
  const w = warehouses.find((it) => it.id === id);
  return w ? w.code : id;
}

// One delivery -> the shared DocList row. Drafts carry number: null and
// total: null (surat jalan has no prices, so Total is always "-"). The row
// keeps the counterparty (Pelanggan) and warehouse code for the columns.
export function deliveryToDocRow(
  delivery: Delivery,
  customers: Partner[],
  warehouses: Warehouse[],
): DocRow {
  return {
    id: delivery.id,
    number: delivery.docNumber ?? null,
    date: delivery.docDate,
    counterparty: nameById(customers, delivery.customerId),
    warehouse: warehouseLabel(warehouses, delivery.warehouseId),
    // Deliveries have no prices; Total renders as "-".
    total: null,
    status: delivery.status,
  };
}

// Sum of line quantities, used in the posting confirm specifics.
export function deliveryTotalQty(lines: { qty: string }[]): number {
  let total = 0;
  for (const line of lines) {
    const qty = Number(line.qty);
    if (!Number.isNaN(qty)) total += qty;
  }
  return total;
}

// Delivery lines -> editable GridLines. Products are resolved from the catalog;
// a line whose product is missing from the catalog is dropped (it cannot be
// rendered or re-posted without its base unit). withCost is always false for
// deliveries, so cost is never carried.
export function deliveryLinesToGrid(
  lines: Delivery["lines"],
  products: Product[],
): GridLine[] {
  const grid: GridLine[] = [];
  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId);
    if (!product) continue;
    grid.push({
      key: line.id,
      product,
      qty: String(line.qty),
    });
  }
  return grid;
}

// Editable GridLines -> the DeliveryInput lines payload. salesOrderLineId rides
// through when the grid line was seeded from a sales order (create-from-source);
// GridLine carries it on the product-free `salesOrderLineId` field we thread via
// the line key map, so callers pass the map explicitly.
export function gridToDeliveryLines(
  lines: GridLine[],
  salesOrderLineIds: Record<string, string | null | undefined> = {},
): DeliveryLineInput[] {
  return lines.map((line) => {
    const salesOrderLineId = salesOrderLineIds[line.key];
    return {
      productId: line.product.id,
      uom: line.product.baseUom,
      qty: line.qty,
      ...(salesOrderLineId ? { salesOrderLineId } : {}),
    };
  });
}

// A draft pre-filled from a source document.
export interface DeliveryDraftSeed {
  customerId: string;
  warehouseId: string;
  lines: GridLine[];
  // gridLine.key -> the sales order line it came from, threaded back into the
  // payload by gridToDeliveryLines so the server can link fulfilment.
  salesOrderLineIds: Record<string, string>;
}

// CREATE-FROM-SOURCE (deliver-from-SO). Given a posted sales order and the
// catalog, build the delivery draft: customer + warehouse copied from the SO,
// one grid line per SO line with default qty = ordered qty and salesOrderLineId
// set. Short posts just post short (M1); the SO shows remaining qty. Lines whose
// product is missing from the catalog are dropped.
export function salesOrderToDraftSeed(
  order: SalesOrder,
  products: Product[],
): DeliveryDraftSeed {
  const lines: GridLine[] = [];
  const salesOrderLineIds: Record<string, string> = {};
  for (const soLine of order.lines) {
    const product = products.find((p) => p.id === soLine.productId);
    if (!product) continue;
    const key = soLine.id;
    lines.push({ key, product, qty: String(soLine.qty) });
    salesOrderLineIds[key] = soLine.id;
  }
  return {
    customerId: order.customerId,
    warehouseId: order.warehouseId,
    lines,
    salesOrderLineIds,
  };
}
