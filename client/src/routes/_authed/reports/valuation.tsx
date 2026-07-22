import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { ReportShell } from "./-report-shell";
import { type ReportFilters, reportQuery } from "./-reports-data";

type StockValuationRow = components["schemas"]["StockValuationRow"];

// Filter state lives in the URL (shareable, survives back-nav per UX-D10).
export const Route = createFileRoute("/_authed/reports/valuation")({
  validateSearch: (search: Record<string, unknown>): ReportFilters => ({
    warehouseId:
      typeof search.warehouseId === "string" ? search.warehouseId : undefined,
    productId:
      typeof search.productId === "string" ? search.productId : undefined,
  }),
  component: ValuationPage,
});

function ValuationPage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data, isPending } = useQuery({
    queryKey: [
      "report-stock-valuation",
      filters.warehouseId,
      filters.productId,
    ],
    queryFn: async () => {
      const { data } = await api.GET("/reports/stock-valuation", {
        params: { query: reportQuery(filters) },
      });
      return data ?? { rows: [], totalValue: "0" };
    },
  });

  const columns = useMemo<ColumnDef<StockValuationRow>[]>(
    () => [
      {
        accessorKey: "sku",
        header: m.report_col_sku(),
        cell: ({ row }) => (
          <span className="font-mono">{row.original.sku}</span>
        ),
      },
      { accessorKey: "productName", header: m.report_col_product() },
      {
        accessorKey: "warehouseName",
        header: m.report_col_warehouse(),
        cell: ({ row }) => (
          <span>
            <span className="font-mono">{row.original.warehouseCode}</span>{" "}
            {row.original.warehouseName}
          </span>
        ),
      },
      {
        accessorKey: "batchNo",
        header: m.report_col_batch(),
        cell: ({ row }) => (
          <span className="font-mono">
            {row.original.batchNo ?? m.report_no_batch()}
          </span>
        ),
      },
      {
        accessorKey: "qtyOnHand",
        header: () => <div className="text-right">{m.report_col_qty()}</div>,
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatNumber(row.original.qtyOnHand)}
          </div>
        ),
      },
      {
        accessorKey: "avgCost",
        header: () => (
          <div className="text-right">{m.report_col_avg_cost()}</div>
        ),
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatCurrency(row.original.avgCost)}
          </div>
        ),
      },
      {
        accessorKey: "value",
        header: () => <div className="text-right">{m.report_col_value()}</div>,
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatCurrency(row.original.value)}
          </div>
        ),
      },
    ],
    [],
  );

  const rows = data?.rows ?? [];

  return (
    <ReportShell
      title={m.report_valuation_title()}
      columns={columns}
      rows={rows}
      getRowId={(row) =>
        `${row.warehouseId}:${row.productId}:${row.batchId ?? ""}`
      }
      loading={isPending}
      filters={filters}
      onFiltersChange={(next) => navigate({ search: next })}
      emptyFirstUseTitle={m.report_valuation_empty_first_use_title()}
      emptyFirstUseDescription={m.report_valuation_empty_first_use_description()}
      footer={
        <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium">
          <span>{m.report_valuation_total()}</span>
          <span className="font-mono tabular-nums">
            {formatCurrency(data?.totalValue ?? "0")}
          </span>
        </div>
      }
    />
  );
}
