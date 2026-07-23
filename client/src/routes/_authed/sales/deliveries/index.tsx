import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { DocList, type DocListFilters } from "@/components/doc-list";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { partnersQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { buildDocListParams } from "@/lib/doc-list-params";
import { m } from "@/paraglide/messages";
import { type DeliveryFilters, deliveryToDocRow } from "./-deliveries-data";

// Filter state lives in the URL (shareable, survives back-nav per UX-D10).
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

  const { data, isPending, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["deliveries", filters],
    queryFn: async ({ pageParam }) => {
      const params = buildDocListParams(
        filters,
        pageParam as string | undefined,
      );
      const { data } = await api.GET("/deliveries", {
        params: { query: params },
      });
      return data ?? { items: [], nextCursor: null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const { data: customers = [] } = useQuery(partnersQueryOptions("customer"));
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);

  const deliveries = data?.pages.flatMap((p) => p.items) ?? [];

  const rows = useMemo(
    () => deliveries.map((d) => deliveryToDocRow(d, customers, warehouses)),
    [deliveries, customers, warehouses],
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
