import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { DocList, type DocListFilters } from "@/components/doc-list";
import { type DocumentStatus, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { warehousesQueryOptions } from "@/lib/catalog";
import { formatDate, formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages";
import {
  filterTransferRows,
  type StockTransfer,
  type TransferDocRow,
  type TransferFilters,
  transferDocRows,
} from "./-transfers-data";

// List filters live in the URL (shareable, survive back-nav per UX-D10). The
// filter values are matched client-side (fix-2 API gap 3).
interface TransferSearch {
  status?: string;
  warehouse?: string;
}

export const Route = createFileRoute("/_authed/stock/transfers/")({
  validateSearch: (search: Record<string, unknown>): TransferSearch => ({
    status: typeof search.status === "string" ? search.status : undefined,
    warehouse:
      typeof search.warehouse === "string" ? search.warehouse : undefined,
  }),
  component: TransferListPage,
});

const transfersQueryOptions = {
  queryKey: ["stock-transfers"] as const,
  queryFn: async (): Promise<StockTransfer[]> => {
    const { data } = await api.GET("/stock-transfers");
    return data?.items ?? [];
  },
};

// Transfer columns (prototype D1, transfer variant): No. / Tanggal /
// Dari -> Ke gudang / Total qty / Status. Total is a quantity, not money, so it
// renders through formatNumber instead of the DocList currency default.
function transferColumns(): ColumnDef<TransferDocRow>[] {
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
      accessorKey: "counterparty",
      header: m.transfer_col_route(),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{row.original.counterparty}</span>
      ),
    },
    {
      accessorKey: "total",
      header: () => (
        <div className="text-right">{m.transfer_col_total_qty()}</div>
      ),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          {row.original.total == null ? "-" : formatNumber(row.original.total)}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: m.doclist_col_status(),
      enableSorting: false,
      cell: ({ row }) => (
        <StatusBadge status={row.original.status as DocumentStatus} />
      ),
    },
  ];
}

function TransferListPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const { data: transfers = [], isLoading } = useQuery(transfersQueryOptions);
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);

  const warehouseName = useMemo(() => {
    const byId = new Map(warehouses.map((w) => [w.id, w.code]));
    return (id: string) => byId.get(id) ?? id;
  }, [warehouses]);

  const rows = useMemo(
    () =>
      transferDocRows(transfers, warehouseName, (from, to) =>
        m.transfer_route({ from, to }),
      ),
    [transfers, warehouseName],
  );

  const filters = useMemo<TransferFilters>(
    () => ({ status: search.status, warehouse: search.warehouse }),
    [search.status, search.warehouse],
  );
  const visible = useMemo(
    () => filterTransferRows(rows, filters),
    [rows, filters],
  );

  const onFiltersChange = (next: DocListFilters) => {
    navigate({
      to: "/stock/transfers",
      search: { status: next.status, warehouse: next.warehouse },
    });
  };

  const columns = useMemo(() => transferColumns(), []);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.transfer_list_title()}
        </h1>
        <Button
          size="sm"
          onClick={() => navigate({ to: "/stock/transfers/new" })}
        >
          {m.transfer_list_new()}
        </Button>
      </div>

      <DocList<TransferDocRow>
        docType="transfer"
        rows={visible}
        columns={columns}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onRowClick={(row) =>
          navigate({
            to: "/stock/transfers/$id",
            params: { id: row.id },
          })
        }
        loading={isLoading}
        emptyFirstUse={{
          title: m.transfer_empty_first_use_title(),
          description: m.transfer_empty_first_use_description(),
          action: (
            <Button
              size="sm"
              onClick={() => navigate({ to: "/stock/transfers/new" })}
            >
              {m.transfer_list_new()}
            </Button>
          ),
        }}
      />
    </div>
  );
}
