import { queryOptions } from "@tanstack/react-query";
import type { DocRow } from "@/components/doc-list";
import type { GridLine } from "@/components/line-grid";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import type { Partner, Product, Warehouse } from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";

export type SalesOrder = components["schemas"]["SalesOrder"];
export type SalesOrderInput = components["schemas"]["SalesOrderInput"];
export type SalesOrderLineInput = components["schemas"]["SalesOrderLineInput"];
export type Delivery = components["schemas"]["Delivery"];

// All sales orders for the list (tenant-scoped by the session cookie). The list
// endpoint returns everything at M1; the DocList filter bar narrows client-side.
export const salesOrdersQueryOptions = queryOptions({
  queryKey: ["sales-orders"],
  queryFn: async (): Promise<SalesOrder[]> => {
    const { data } = await api.GET("/sales-orders");
    return data?.items ?? [];
  },
});

export function salesOrderQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["sales-order", id],
    queryFn: async (): Promise<SalesOrder | null> => {
      const { data } = await api.GET("/sales-orders/{id}", {
        params: { path: { id } },
      });
      return data ?? null;
    },
  });
}

// All deliveries, used for the client-side fulfillment join (INC-4): the SO
// detail and list read this to roll up delivered qty per line. The delivery
// wave already owns the ["deliveries"] cache key.
export const deliveriesForOrdersQueryOptions = queryOptions({
  queryKey: ["deliveries"],
  queryFn: async (): Promise<Delivery[]> => {
    const { data } = await api.GET("/deliveries");
    return data?.items ?? [];
  },
});

// Client-side URL filter state for the sales order list. Mirrors DocListFilters
// (status / warehouse); date-range is reserved but not wired at M1. Lives in the
// route's search params (shareable, survives back-nav per UX-D10).
export interface SalesOrderFilters {
  status?: string;
  warehouse?: string;
}

const FILTER_KEYS: (keyof SalesOrderFilters)[] = ["status", "warehouse"];

// Which filters carry a value; drives the empty-state variant and chip bar.
export function activeSalesOrderFilters(
  filters: SalesOrderFilters,
): (keyof SalesOrderFilters)[] {
  return FILTER_KEYS.filter((key) => {
    const value = filters[key];
    return value != null && value !== "";
  });
}

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

// Sum of qty * unitPrice over the order lines, ignoring non-numeric values. A
// sales order carries a price, so its list row shows a monetary total.
export function salesOrderTotal(lines: SalesOrder["lines"]): number {
  let total = 0;
  for (const line of lines) {
    const qty = Number(line.qty);
    const price = Number(line.unitPrice);
    if (!Number.isNaN(qty) && !Number.isNaN(price)) total += qty * price;
  }
  return total;
}

// One sales order -> the shared DocList row. Drafts carry number: null (a doc
// number is assigned only at posting). Total is the order value.
export function salesOrderToDocRow(
  order: SalesOrder,
  customers: Partner[],
  warehouses: Warehouse[],
): DocRow {
  return {
    id: order.id,
    number: order.docNumber ?? null,
    date: order.docDate,
    counterparty: nameById(customers, order.customerId),
    warehouse: warehouseLabel(warehouses, order.warehouseId),
    total: salesOrderTotal(order.lines),
    status: order.status,
  };
}

// Sales order lines -> editable GridLines. Products are resolved from the
// catalog; a line whose product is missing is dropped (it cannot be rendered or
// re-posted without its base unit). withCost is true - unitPrice rides on the
// grid line's `cost` slot.
export function salesOrderLinesToGrid(
  lines: SalesOrder["lines"],
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
      cost: String(line.unitPrice),
    });
  }
  return grid;
}

// Editable GridLines -> the SalesOrderInput lines payload. The grid's `cost`
// slot carries the unit price; an empty price is dropped so the server applies
// its default.
export function gridToSalesOrderLines(
  lines: GridLine[],
): SalesOrderLineInput[] {
  return lines.map((line) => ({
    productId: line.product.id,
    uom: line.product.baseUom,
    qty: line.qty,
    ...(line.cost?.trim() ? { unitPrice: line.cost } : {}),
  }));
}

// --- THE CHAIN: client-side fulfillment join (INC-4) --------------------------
// The API exposes no per-line delivered rollup, so the SO screens compute it by
// joining posted deliveries whose lines carry this SO's salesOrderLineId. Drafts
// and reversals do not count toward fulfillment.

// Total delivered qty per sales-order line id, summed over posted deliveries.
export function deliveredByLine(deliveries: Delivery[]): Map<string, number> {
  const byLine = new Map<string, number>();
  for (const delivery of deliveries) {
    if (delivery.status !== "posted") continue;
    for (const line of delivery.lines) {
      const soLineId = line.salesOrderLineId;
      if (!soLineId) continue;
      const qty = Number(line.qty);
      if (Number.isNaN(qty)) continue;
      byLine.set(soLineId, (byLine.get(soLineId) ?? 0) + qty);
    }
  }
  return byLine;
}

export interface LineFulfillment {
  lineId: string;
  ordered: number;
  delivered: number;
  remaining: number;
}

// Per-line ordered / delivered / remaining for one sales order. `deliveries` is
// the full delivery list; only those linked to this order (by salesOrderId) and
// posted contribute delivered qty. Remaining clamps at zero on over-delivery.
export function lineFulfillment(
  order: SalesOrder,
  deliveries: Delivery[],
): LineFulfillment[] {
  const linked = deliveries.filter((d) => d.salesOrderId === order.id);
  const byLine = deliveredByLine(linked);
  return order.lines.map((line) => {
    const ordered = Number(line.qty) || 0;
    const delivered = byLine.get(line.id) ?? 0;
    return {
      lineId: line.id,
      ordered,
      delivered,
      remaining: Math.max(ordered - delivered, 0),
    };
  });
}

export interface DeliveryProgress {
  delivered: number;
  total: number;
}

// Coarse "3/5 dikirim" progress for the list: how many lines are fully
// delivered (remaining reaches zero) over the total line count.
export function deliveryProgress(
  order: SalesOrder,
  deliveries: Delivery[],
): DeliveryProgress {
  const rows = lineFulfillment(order, deliveries);
  const delivered = rows.filter(
    (r) => r.ordered > 0 && r.remaining === 0,
  ).length;
  return { delivered, total: rows.length };
}

// Deliveries linked to a given sales order, for the "Related pengiriman"
// section. Sorted newest first.
export function linkedDeliveries(
  orderId: string,
  deliveries: Delivery[],
): Delivery[] {
  return deliveries
    .filter((d) => d.salesOrderId === orderId)
    .sort(
      (a, b) => new Date(b.docDate).getTime() - new Date(a.docDate).getTime(),
    );
}

// The reason posting is unavailable, or null when it is allowed. Shown as a
// caption under the button, never a bare disabled control (UX-D10).
export function salesOrderDraftBlockReason({
  customerId,
  warehouseId,
  lines,
}: {
  customerId: string;
  warehouseId: string;
  lines: GridLine[];
}): string | null {
  if (!customerId) return m.so_reason_no_customer();
  if (!warehouseId) return m.so_reason_no_warehouse();
  if (lines.length === 0 || !lines.every((l) => Number(l.qty) > 0)) {
    return m.so_reason_no_lines();
  }
  return null;
}
