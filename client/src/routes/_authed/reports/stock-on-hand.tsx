import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { ReportShell } from "./-report-shell";
import { type ReportFilters, reportQuery } from "./-reports-data";

type StockOnHandRow = components["schemas"]["StockOnHandRow"];

// Filter state lives in the URL (shareable, survives back-nav per UX-D10).
export const Route = createFileRoute("/_authed/reports/stock-on-hand")({
  validateSearch: (search: Record<string, unknown>): ReportFilters => ({
    warehouseId:
      typeof search.warehouseId === "string" ? search.warehouseId : undefined,
    productId:
      typeof search.productId === "string" ? search.productId : undefined,
  }),
  component: StockOnHandPage,
});

function StockOnHandPage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data, isPending } = useQuery({
    queryKey: ["report-stock-on-hand", filters.warehouseId, filters.productId],
    queryFn: async () => {
      const { data } = await api.GET("/reports/stock-on-hand", {
        params: { query: reportQuery(filters) },
      });
      return data?.rows ?? [];
    },
  });

  const columns = useMemo<ColumnDef<StockOnHandRow>[]>(
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
    ],
    [],
  );

  return (
    <ReportShell
      title={m.report_soh_title()}
      columns={columns}
      rows={data ?? []}
      getRowId={(row) =>
        `${row.warehouseId}:${row.productId}:${row.batchId ?? ""}`
      }
      loading={isPending}
      filters={filters}
      onFiltersChange={(next) => navigate({ search: next })}
      emptyFirstUseTitle={m.report_soh_empty_first_use_title()}
      emptyFirstUseDescription={m.report_soh_empty_first_use_description()}
    />
  );
}
