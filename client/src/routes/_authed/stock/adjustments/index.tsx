import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import {
  DocList,
  type DocListFilters,
  type DocRow,
} from "@/components/doc-list";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { pickerWarehousesQueryOptions } from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";
import { adjustmentDocRows, type StockAdjustment } from "./-adjustments-data";

// Filter state lives in the URL (shareable, survives back-nav per UX-D10).
export const Route = createFileRoute("/_authed/stock/adjustments/")({
  validateSearch: (search: Record<string, unknown>): DocListFilters => ({
    status: typeof search.status === "string" ? search.status : undefined,
    dateRange:
      typeof search.dateRange === "string" ? search.dateRange : undefined,
    warehouse:
      typeof search.warehouse === "string" ? search.warehouse : undefined,
  }),
  component: AdjustmentListPage,
});

// Adjustments carry no partner; the counterparty slot is repurposed for the
// Alasan column, so this list defines its own columns (No./Tanggal/Gudang/
// Alasan/Total/Status per the brief).
function adjustmentColumns(): ColumnDef<DocRow>[] {
  return [
    {
      accessorKey: "number",
      header: m.doclist_col_no(),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">
          {row.original.number ?? m.status_draft()}
        </span>
      ),
    },
    {
      accessorKey: "date",
      header: m.doclist_col_date(),
      enableSorting: false,
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      accessorKey: "warehouse",
      header: m.doclist_col_warehouse(),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{row.original.warehouse}</span>
      ),
    },
    {
      accessorKey: "counterparty",
      header: m.adjustment_col_reason(),
      enableSorting: false,
    },
    {
      accessorKey: "total",
      header: () => <div className="text-right">{m.doclist_col_total()}</div>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          {row.original.total == null
            ? "-"
            : formatCurrency(row.original.total)}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: m.doclist_col_status(),
      enableSorting: false,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
}

function AdjustmentListPage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data: adjustments = [], isPending } = useQuery({
    queryKey: ["stock-adjustments"],
    queryFn: async (): Promise<StockAdjustment[]> =>
      (await api.GET("/stock-adjustments")).data ?? [],
  });
  const { data: warehouses = [] } = useQuery(pickerWarehousesQueryOptions);

  const rows = useMemo(
    () => adjustmentDocRows(adjustments, warehouses),
    [adjustments, warehouses],
  );

  const columns = useMemo(() => adjustmentColumns(), []);

  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.adjustment_list_title()}
        </h1>
        <Link
          to="/stock/adjustments/new"
          className={buttonVariants({ size: "sm" })}
        >
          + {m.adjustment_list_new()}
        </Link>
      </div>

      <DocList
        docType="adjustment"
        rows={rows}
        columns={columns}
        filters={filters}
        onFiltersChange={(next) => navigate({ search: next, replace: true })}
        onRowClick={(row) =>
          navigate({
            to: "/stock/adjustments/$id",
            params: { id: row.id },
          })
        }
        loading={isPending}
        emptyFirstUse={{
          title: m.adjustment_list_empty_title(),
          description: m.adjustment_list_empty_description(),
          action: (
            <Link
              to="/stock/adjustments/new"
              className={buttonVariants({ size: "sm" })}
            >
              + {m.adjustment_list_new()}
            </Link>
          ),
        }}
      />
    </main>
  );
}
