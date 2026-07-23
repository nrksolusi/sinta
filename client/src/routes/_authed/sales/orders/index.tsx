import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import {
  DocList,
  type DocListFilters,
  type DocRow,
} from "@/components/doc-list";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { partnersQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { buildDocListParams } from "@/lib/doc-list-params";
import { m } from "@/paraglide/messages";
import { salesOrderColumns } from "./-sales-order-columns";
import {
  deliveriesForOrdersQueryOptions,
  deliveryProgress,
  type SalesOrder,
  type SalesOrderFilters,
  salesOrderToDocRow,
} from "./-sales-order-data";

// A DocList row extended with the client-computed delivered-progress cell. The
// server exposes no per-line fulfillment rollup (INC-4), so the "3/5 dikirim"
// column is joined from posted deliveries client-side.
type SalesOrderRow = DocRow & { delivered: string };

export const Route = createFileRoute("/_authed/sales/orders/")({
  validateSearch: (search: Record<string, unknown>): SalesOrderFilters => ({
    status: typeof search.status === "string" ? search.status : undefined,
    warehouse:
      typeof search.warehouse === "string" ? search.warehouse : undefined,
  }),
  component: SalesOrderListPage,
});

function progressLabel(
  order: SalesOrder,
  deliveries: Parameters<typeof deliveryProgress>[1],
): string {
  if (order.status !== "posted") return "-";
  const { delivered, total } = deliveryProgress(order, deliveries);
  if (total === 0) return "-";
  return m.so_progress({ delivered, total });
}

function SalesOrderListPage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data, isPending, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["sales-orders", filters],
    queryFn: async ({ pageParam }) => {
      const params = buildDocListParams(
        filters,
        pageParam as string | undefined,
      );
      const { data } = await api.GET("/sales-orders", {
        params: { query: params },
      });
      return data ?? { items: [], nextCursor: null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const { data: customers = [] } = useQuery(partnersQueryOptions("customer"));
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const { data: deliveries = [] } = useQuery(deliveriesForOrdersQueryOptions);

  const orders = data?.pages.flatMap((p) => p.items) ?? [];

  const rows = useMemo<SalesOrderRow[]>(
    () =>
      orders.map((o) => ({
        ...salesOrderToDocRow(o, customers, warehouses),
        delivered: progressLabel(o, deliveries),
      })),
    [orders, customers, warehouses, deliveries],
  );

  const columns = useMemo<ColumnDef<SalesOrderRow>[]>(
    () => salesOrderColumns(),
    [],
  );

  const goToNew = () => navigate({ to: "/sales/orders/new" });

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.so_list_title()}
        </h1>
        <Button onClick={goToNew}>{m.so_list_new()}</Button>
      </div>

      <DocList<SalesOrderRow>
        docType="sales_order"
        rows={rows}
        columns={columns}
        filters={filters as DocListFilters}
        onFiltersChange={(next) =>
          navigate({ search: next as SalesOrderFilters })
        }
        onRowClick={(row) =>
          navigate({ to: "/sales/orders/$id", params: { id: row.id } })
        }
        loading={isPending}
        emptyFirstUse={{
          title: m.so_list_empty_title(),
          description: m.so_list_empty_description(),
          action: <Button onClick={goToNew}>{m.so_list_new()}</Button>,
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
