import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import {
  DocList,
  type DocListFilters,
  type DocRow,
} from "@/components/doc-list";
import { Button } from "@/components/ui/button";
import { partnersQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { m } from "@/paraglide/messages";
import { salesOrderColumns } from "./-sales-order-columns";
import {
  deliveriesForOrdersQueryOptions,
  deliveryProgress,
  filterSalesOrders,
  type SalesOrder,
  type SalesOrderFilters,
  salesOrdersQueryOptions,
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

  const { data: orders = [], isPending } = useQuery(salesOrdersQueryOptions);
  const { data: customers = [] } = useQuery(partnersQueryOptions("customer"));
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const { data: deliveries = [] } = useQuery(deliveriesForOrdersQueryOptions);

  const rows = useMemo<SalesOrderRow[]>(
    () =>
      filterSalesOrders(orders, filters).map((o) => ({
        ...salesOrderToDocRow(o, customers, warehouses),
        delivered: progressLabel(o, deliveries),
      })),
    [orders, filters, customers, warehouses, deliveries],
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
    </div>
  );
}
