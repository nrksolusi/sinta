import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { DocList, type DocListFilters } from "@/components/doc-list";
import { Button } from "@/components/ui/button";
import { partnersQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { m } from "@/paraglide/messages";
import {
  type DeliveryFilters,
  deliveriesQueryOptions,
  deliveryToDocRow,
  filterDeliveries,
} from "./-deliveries-data";

// Filter state lives in the URL (shareable, survives back-nav per UX-D10). The
// list endpoint has no filter params at M1, so filtering is client-side behind
// the same URL-param interface (fix-2 API gap 3).
export const Route = createFileRoute("/_authed/sales/deliveries/")({
  validateSearch: (search: Record<string, unknown>): DeliveryFilters => ({
    status: typeof search.status === "string" ? search.status : undefined,
    warehouse:
      typeof search.warehouse === "string" ? search.warehouse : undefined,
  }),
  component: DeliveryListPage,
});

function DeliveryListPage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data: deliveries = [], isPending } = useQuery(deliveriesQueryOptions);
  const { data: customers = [] } = useQuery(partnersQueryOptions("customer"));
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);

  const rows = useMemo(
    () =>
      filterDeliveries(deliveries, filters).map((d) =>
        deliveryToDocRow(d, customers, warehouses),
      ),
    [deliveries, filters, customers, warehouses],
  );

  const goToNew = () => navigate({ to: "/sales/deliveries/new" });

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.delivery_list_title()}
        </h1>
        <Button onClick={goToNew}>{m.delivery_list_new()}</Button>
      </div>

      <DocList
        docType="delivery"
        rows={rows}
        filters={filters as DocListFilters}
        onFiltersChange={(next) =>
          navigate({ search: next as DeliveryFilters })
        }
        onRowClick={(row) =>
          navigate({ to: "/sales/deliveries/$id", params: { id: row.id } })
        }
        loading={isPending}
        emptyFirstUse={{
          title: m.delivery_list_empty_title(),
          description: m.delivery_list_empty_description(),
          action: <Button onClick={goToNew}>{m.delivery_list_new()}</Button>,
        }}
      />
    </div>
  );
}
