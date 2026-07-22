import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { components } from "@/lib/api-types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages";

type StockOnHandRow = components["schemas"]["StockOnHandRow"];
type StockValuationRow = components["schemas"]["StockValuationRow"];
type StockCardEntry = components["schemas"]["StockCardEntry"];

// docType tokens the server stamps on every movement (server documents.go) ->
// their Wave-2 record routes (fix-2 route map). Those routes may 404 until
// Wave 2 ships them; the plan says link anyway so the audit trail is navigable
// the moment they land.
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

// Value lookup by (warehouse, batch) so each on-hand line renders its own
// booked value from the valuation report. The reports share the same key set
// (both fold the journal per stock_levels cache), so this is a left join with
// on-hand as the driver.
function valueKey(warehouseId: string, batchId?: string): string {
  return `${warehouseId}::${batchId ?? ""}`;
}

export function ProductStockTable({
  onHand,
  valuation,
  batchTracked,
}: {
  onHand: StockOnHandRow[];
  valuation: StockValuationRow[];
  batchTracked: boolean;
}) {
  if (onHand.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {m.product_detail_stock_empty()}
      </p>
    );
  }

  const values = new Map(
    valuation.map((row) => [valueKey(row.warehouseId, row.batchId), row.value]),
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.product_detail_stock_col_warehouse()}</TableHead>
          {batchTracked && (
            <TableHead>{m.product_detail_stock_col_batch()}</TableHead>
          )}
          <TableHead className="text-right">
            {m.product_detail_stock_col_qty()}
          </TableHead>
          <TableHead className="text-right">
            {m.product_detail_stock_col_value()}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {onHand.map((row) => {
          const value = values.get(valueKey(row.warehouseId, row.batchId));
          return (
            <TableRow key={valueKey(row.warehouseId, row.batchId)}>
              <TableCell className="font-mono">{row.warehouseCode}</TableCell>
              {batchTracked && (
                <TableCell className="font-mono">
                  {row.batchNo ?? m.product_detail_no_batch()}
                </TableCell>
              )}
              <TableCell className="text-right font-mono tabular-nums">
                {formatNumber(row.qtyOnHand)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {value == null ? "-" : formatCurrency(value)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function ProductSummaryCard({
  valuation,
}: {
  valuation: StockValuationRow[];
}) {
  const totalQty = valuation.reduce(
    (sum, row) => sum + Number(row.qtyOnHand),
    0,
  );
  const totalValue = valuation.reduce((sum, row) => sum + Number(row.value), 0);
  // Weighted average across warehouses: total value / total qty. Zero-guard so
  // an empty product reads Rp 0 rather than NaN.
  const avgCost = totalQty === 0 ? 0 : totalValue / totalQty;

  const rows: { label: string; value: string }[] = [
    {
      label: m.product_detail_summary_total_qty(),
      value: formatNumber(totalQty),
    },
    {
      label: m.product_detail_summary_total_value(),
      value: formatCurrency(totalValue),
    },
    {
      label: m.product_detail_summary_avg_cost(),
      value: formatCurrency(avgCost),
    },
  ];

  return (
    <dl className="flex flex-col gap-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4"
        >
          <dt className="text-sm text-muted-foreground">{row.label}</dt>
          <dd className="font-mono text-sm tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const MOVEMENT_LABEL: Record<StockCardEntry["movementType"], () => string> = {
  receipt: () => m.movement_receipt(),
  issue: () => m.movement_issue(),
  transfer_in: () => m.movement_transfer_in(),
  transfer_out: () => m.movement_transfer_out(),
  adjustment: () => m.movement_adjustment(),
  opname: () => m.movement_opname(),
  cost_correction: () => m.movement_cost_correction(),
  revaluation: () => m.movement_revaluation(),
};

// Positive quantities read better with an explicit "+" in the audit trail
// (D7 shows "+24,00"); format.ts handles the negative sign for issues.
function signedQty(qty: string): string {
  const n = Number(qty);
  const formatted = formatNumber(n);
  return n > 0 ? `+${formatted}` : formatted;
}

export function KartuStokTable({ entries }: { entries: StockCardEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {m.product_detail_stock_card_empty()}
      </p>
    );
  }

  // The report is the append-only journal in chronological order; show the 20
  // most recent, newest first.
  const recent = [...entries].sort((a, b) => b.seq - a.seq).slice(0, 20);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.product_detail_stock_card_col_date()}</TableHead>
          <TableHead>{m.product_detail_stock_card_col_doc()}</TableHead>
          <TableHead className="text-right">
            {m.product_detail_stock_card_col_qty()}
          </TableHead>
          <TableHead className="text-right">
            {m.product_detail_stock_card_col_balance()}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recent.map((e) => {
          const href = docHref(e.docType, e.docId);
          const label = MOVEMENT_LABEL[e.movementType]();
          return (
            <TableRow key={e.movementId}>
              <TableCell className="tabular-nums">
                {formatDate(e.effectiveAt)}
              </TableCell>
              <TableCell>
                {href ? (
                  <a
                    href={href}
                    className="font-mono text-sm underline underline-offset-4 hover:text-foreground"
                  >
                    {label}
                  </a>
                ) : (
                  <span className="text-sm">{label}</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {signedQty(e.qty)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatNumber(e.runningQty)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
