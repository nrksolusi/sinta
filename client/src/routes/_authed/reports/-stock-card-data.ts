import type { components } from "@/lib/api-types";
import { formatNumber } from "@/lib/format";

export type StockCardEntry = components["schemas"]["StockCardEntry"];

// docType tokens the server stamps on every movement (server documents.go) ->
// their Wave-2 record routes (fix-2 route map). Those routes may 404 until
// Wave 2 ships them; the plan (UX-D6) says link anyway so the audit trail is
// navigable the moment they land.
const DOC_ROUTE: Record<string, string> = {
  purchase_order: "/purchases/orders",
  goods_receipt: "/purchases/receipts",
  sales_order: "/sales/orders",
  delivery: "/sales/deliveries",
  stock_transfer: "/stock/transfers",
  stock_adjustment: "/stock/adjustments",
  stock_opname: "/stock/opnames",
};

export function docHref(
  docType: string | undefined,
  docId: string | undefined,
): string | null {
  if (!docType || !docId) return null;
  const base = DOC_ROUTE[docType];
  return base ? `${base}/${docId}` : null;
}

// Positive quantities read better with an explicit "+" in the audit trail
// (UX-D6 shows "+24,00"); format.ts already renders the negative sign for
// issues, so only the positive case needs the prefix.
export function signedQty(qty: string): string {
  const n = Number(qty);
  const formatted = formatNumber(n);
  return n > 0 ? `+${formatted}` : formatted;
}

// The report is the append-only journal; show newest first by sequence so the
// most recent movement is at the top, matching the other report tables.
export function sortEntriesNewestFirst(
  entries: StockCardEntry[],
): StockCardEntry[] {
  return [...entries].sort((a, b) => b.seq - a.seq);
}
