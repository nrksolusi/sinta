import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { DocList, type DocListFilters } from "@/components/doc-list";
import { type DocumentStatus, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { warehousesQueryOptions } from "@/lib/catalog";
import { buildDocListParams } from "@/lib/doc-list-params";
import { formatDate, formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages";
import {
  type StockTransfer,
  type TransferDocRow,
  type TransferFilters,
  transferDocRows,
} from "./-transfers-data";

// List filters live in the URL (shareable, survive back-nav per UX-D10).
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

  const filters = useMemo<TransferFilters>(
    () => ({ status: search.status, warehouse: search.warehouse }),
    [search.status, search.warehouse],
  );

  const { data, isLoading, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["stock-transfers", filters],
    queryFn: async ({ pageParam }) => {
      const params = buildDocListParams(
        filters,
        pageParam as string | undefined,
      );
      const { data } = await api.GET("/stock-transfers", {
        params: { query: params },
      });
      return data ?? { items: [], nextCursor: null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);

  const warehouseName = useMemo(() => {
    const byId = new Map(warehouses.map((w) => [w.id, w.code]));
    return (id: string) => byId.get(id) ?? id;
  }, [warehouses]);

  const transfers: StockTransfer[] = data?.pages.flatMap((p) => p.items) ?? [];

  const rows = useMemo(
    () =>
      transferDocRows(transfers, warehouseName, (from, to) =>
        m.transfer_route({ from, to }),
      ),
    [transfers, warehouseName],
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
        rows={rows}
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
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => fetchNextPage()}>
            {m.doclist_load_more()}
          </Button>
        </div>
      )}
    </div>
  );
}
