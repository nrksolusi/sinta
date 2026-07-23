import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { DocList, type DocRow } from "@/components/doc-list";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { buildDocListParams } from "@/lib/doc-list-params";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  pickerPartnersQueryOptions,
  pickerWarehousesQueryOptions,
} from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";
import {
  type OrderSearch,
  orderFilterState,
  poReceivedProgress,
  purchaseOrderToDocRow,
} from "./-order-data";

// A PO list row is a DocRow plus a client-computed received-progress figure
// ("3/5 diterima"). Progress is a client-side join over linked goods receipts;
// the server exposes no received rollup yet (INC-4).
interface OrderRow extends DocRow {
  progressReceived: number;
  progressTotal: number;
}

// Filter state lives in the URL (shareable, survives back-nav per UX-D10).
export const Route = createFileRoute("/_authed/purchases/orders/")({
  validateSearch: (search: Record<string, unknown>): OrderSearch => ({
    status: typeof search.status === "string" ? search.status : "",
    warehouse: typeof search.warehouse === "string" ? search.warehouse : "",
    tanggal: typeof search.tanggal === "string" ? search.tanggal : "",
  }),
  component: OrderListPage,
});

function OrderListPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const filters = orderFilterState(search);

  const { data, isPending, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["purchase-orders", filters],
    queryFn: async ({ pageParam }) => {
      const params = buildDocListParams(
        filters,
        pageParam as string | undefined,
      );
      const { data } = await api.GET("/purchase-orders", {
        params: { query: params },
      });
      return data ?? { items: [], nextCursor: null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  // Linked receipts drive the client-side received-progress column.
  const { data: receipts = [] } = useQuery({
    queryKey: ["goods-receipts"],
    queryFn: async () => {
      const { data } = await api.GET("/goods-receipts");
      return data?.items ?? [];
    },
  });
  const { data: suppliers = [] } = useQuery(
    pickerPartnersQueryOptions("supplier"),
  );
  const { data: warehouses = [] } = useQuery(pickerWarehousesQueryOptions);

  const supplierName = useMemo(() => {
    const byId = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: string) => byId.get(id) ?? id;
  }, [suppliers]);
  const warehouseCode = useMemo(() => {
    const byId = new Map(warehouses.map((w) => [w.id, w.code]));
    return (id: string) => byId.get(id) ?? id;
  }, [warehouses]);

  const orders = data?.pages.flatMap((p) => p.items) ?? [];

  const rows = useMemo<OrderRow[]>(
    () =>
      orders.map((po) => {
        const progress = poReceivedProgress(po, receipts);
        return {
          ...purchaseOrderToDocRow(po, { supplierName, warehouseCode }),
          progressReceived: progress.received,
          progressTotal: progress.total,
        };
      }),
    [orders, receipts, supplierName, warehouseCode],
  );

  return (
    <main className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.po_list_title()}
        </h1>
        <Button onClick={() => navigate({ to: "/purchases/orders/new" })}>
          {m.po_list_new()}
        </Button>
      </div>

      <DocList<OrderRow>
        docType="purchase_order"
        rows={rows}
        columns={orderColumns()}
        filters={filters}
        onFiltersChange={(next) =>
          navigate({
            to: "/purchases/orders",
            search: {
              status: next.status ?? "",
              warehouse: next.warehouse ?? "",
              tanggal: next.dateRange ?? "",
            },
          })
        }
        onRowClick={(row) =>
          navigate({
            to: "/purchases/orders/$id",
            params: { id: row.id },
          })
        }
        loading={isPending}
        emptyFirstUse={{
          title: m.po_list_empty_first_use_title(),
          description: m.po_list_empty_first_use_description(),
          action: (
            <Button onClick={() => navigate({ to: "/purchases/orders/new" })}>
              {m.po_list_new()}
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
    </main>
  );
}

// PO columns = the default document columns plus a received-progress column.
// Kept in this route (not DocList) because the join is PO-specific.
function orderColumns(): ColumnDef<OrderRow>[] {
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
      header: m.doclist_col_counterparty(),
      enableSorting: false,
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
      id: "progress",
      header: m.po_col_progress(),
      enableSorting: false,
      cell: ({ row }) => {
        // A draft has no receipts yet; keep the cell quiet with a dash.
        if (
          row.original.status === "draft" ||
          row.original.progressTotal === 0
        ) {
          return <span className="text-muted-foreground">-</span>;
        }
        const done =
          row.original.progressReceived >= row.original.progressTotal;
        return (
          <Badge
            variant={done ? "default" : "outline"}
            className="tabular-nums"
          >
            {m.po_progress({
              received: row.original.progressReceived,
              total: row.original.progressTotal,
            })}
          </Badge>
        );
      },
    },
    {
      accessorKey: "status",
      header: m.doclist_col_status(),
      enableSorting: false,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
}
