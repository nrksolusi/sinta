import type { DocumentStatus } from "@/components/status-badge";
import type { components } from "@/lib/api-types";
import { m } from "@/paraglide/messages";

type Partner = components["schemas"]["Partner"];
type Warehouse = components["schemas"]["Warehouse"];

// One raw document from each list endpoint. Only the fields the dashboard reads
// are declared; the real payloads carry more.
type RawDoc = {
  id: string;
  docNumber?: string | null;
  docDate: string;
  status: components["schemas"]["DocumentStatus"];
  lines: unknown[];
  supplierId?: string;
  customerId?: string;
  warehouseId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
};

// The seven document kinds the dashboard unions. `route` is the list-route base;
// the detail link is `${route}/${id}` (built by other engineers, may 404 until
// their wave lands - we link anyway per the task brief).
export type DocKind =
  | "goodsReceipt"
  | "delivery"
  | "purchaseOrder"
  | "salesOrder"
  | "stockTransfer"
  | "stockAdjustment"
  | "stockOpname";

interface KindConfig {
  route: string;
  typeLabel: () => string;
  // How to describe the counterparty/location for this kind, given lookups.
  counterparty: (
    doc: RawDoc,
    partners: Map<string, Partner>,
    warehouses: Map<string, Warehouse>,
  ) => string;
}

const KINDS: Record<DocKind, KindConfig> = {
  goodsReceipt: {
    route: "/purchases/receipts",
    typeLabel: () => m.dashboard_doctype_goods_receipt(),
    counterparty: (doc, partners) => partnerName(partners, doc.supplierId),
  },
  delivery: {
    route: "/sales/deliveries",
    typeLabel: () => m.dashboard_doctype_delivery(),
    counterparty: (doc, partners) => partnerName(partners, doc.customerId),
  },
  purchaseOrder: {
    route: "/purchases/orders",
    typeLabel: () => m.dashboard_doctype_purchase_order(),
    counterparty: (doc, partners) => partnerName(partners, doc.supplierId),
  },
  salesOrder: {
    route: "/sales/orders",
    typeLabel: () => m.dashboard_doctype_sales_order(),
    counterparty: (doc, partners) => partnerName(partners, doc.customerId),
  },
  stockTransfer: {
    route: "/stock/transfers",
    typeLabel: () => m.dashboard_doctype_stock_transfer(),
    counterparty: (doc, _partners, warehouses) =>
      m.dashboard_transfer_route({
        from: warehouseName(warehouses, doc.fromWarehouseId),
        to: warehouseName(warehouses, doc.toWarehouseId),
      }),
  },
  stockAdjustment: {
    route: "/stock/adjustments",
    typeLabel: () => m.dashboard_doctype_stock_adjustment(),
    counterparty: (doc, _partners, warehouses) =>
      warehouseName(warehouses, doc.warehouseId),
  },
  stockOpname: {
    route: "/stock/opnames",
    typeLabel: () => m.dashboard_doctype_stock_opname(),
    counterparty: (doc, _partners, warehouses) =>
      warehouseName(warehouses, doc.warehouseId),
  },
};

function partnerName(partners: Map<string, Partner>, id?: string): string {
  if (!id) return m.dashboard_unknown_partner();
  return partners.get(id)?.name ?? m.dashboard_unknown_partner();
}

function warehouseName(
  warehouses: Map<string, Warehouse>,
  id?: string,
): string {
  if (!id) return m.dashboard_unknown_warehouse();
  return warehouses.get(id)?.name ?? m.dashboard_unknown_warehouse();
}

// The normalized shape both the draft card and the recent-docs table render.
export interface DashboardDoc {
  id: string;
  kind: DocKind;
  to: string;
  number: string | null;
  typeLabel: string;
  counterparty: string;
  lineCount: number;
  date: string;
  status: DocumentStatus;
}

// Raw lists keyed by kind. Missing/undefined lists are treated as empty so the
// route can pass query data straight through without pre-filling every key.
export type RawDocLists = Partial<Record<DocKind, RawDoc[]>>;

// Flatten every kind's list into one normalized array, resolving counterparty
// and warehouse names from the supplied lookups. Order is not guaranteed here;
// callers sort (drafts card filters to draft, recent card sorts by date desc).
export function toDashboardDocs(
  lists: RawDocLists,
  partners: Partner[],
  warehouses: Warehouse[],
): DashboardDoc[] {
  const partnerMap = new Map(partners.map((p) => [p.id, p]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

  const docs: DashboardDoc[] = [];
  for (const kind of Object.keys(KINDS) as DocKind[]) {
    const config = KINDS[kind];
    for (const doc of lists[kind] ?? []) {
      docs.push({
        id: doc.id,
        kind,
        to: `${config.route}/${doc.id}`,
        number: doc.docNumber ?? null,
        typeLabel: config.typeLabel(),
        counterparty: config.counterparty(doc, partnerMap, warehouseMap),
        lineCount: doc.lines?.length ?? 0,
        date: doc.docDate,
        status: doc.status,
      });
    }
  }
  return docs;
}

// Drafts, newest first (UX-D2 resume surface).
export function draftDocs(docs: DashboardDoc[]): DashboardDoc[] {
  return docs
    .filter((doc) => doc.status === "draft")
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Every document, newest first, capped at `limit` (dashboard shows 10).
export function recentDocs(
  docs: DashboardDoc[],
  limit: number,
): DashboardDoc[] {
  return [...docs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
