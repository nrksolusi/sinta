import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { DocList, type DocRow } from "@/components/doc-list";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { buildDocListParams } from "@/lib/doc-list-params";
import {
  pickerPartnersQueryOptions,
  pickerWarehousesQueryOptions,
} from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";
import {
  type ReceiptSearch,
  receiptFilterState,
  receiptToDocRow,
} from "./-receipt-data";

// Filter state lives in the URL (shareable, survives back-nav per UX-D10).
// status = document status, warehouse = warehouseId, tanggal = exact docDate.
export const Route = createFileRoute("/_authed/purchases/receipts/")({
  validateSearch: (search: Record<string, unknown>): ReceiptSearch => ({
    status: typeof search.status === "string" ? search.status : "",
    warehouse: typeof search.warehouse === "string" ? search.warehouse : "",
    tanggal: typeof search.tanggal === "string" ? search.tanggal : "",
  }),
  component: ReceiptListPage,
});

function ReceiptListPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const filters = receiptFilterState(search);

  const { data, isPending, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["goods-receipts", filters],
    queryFn: async ({ pageParam }) => {
      const params = buildDocListParams(
        filters,
        pageParam as string | undefined,
      );
      const { data } = await api.GET("/goods-receipts", {
        params: { query: params },
      });
      return data ?? { items: [], nextCursor: null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
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

  const rows = useMemo<DocRow[]>(
    () =>
      (data?.pages.flatMap((p) => p.items) ?? []).map((gr) =>
        receiptToDocRow(gr, { supplierName, warehouseCode }),
      ),
    [data, supplierName, warehouseCode],
  );

  return (
    <main className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.receipt_list_title()}
        </h1>
        <Button onClick={() => navigate({ to: "/purchases/receipts/new" })}>
          {m.receipt_list_new()}
        </Button>
      </div>

      <DocList
        docType="receipt"
        rows={rows}
        filters={filters}
        onFiltersChange={(next) =>
          navigate({
            to: "/purchases/receipts",
            search: {
              status: next.status ?? "",
              warehouse: next.warehouse ?? "",
              tanggal: next.dateRange ?? "",
            },
          })
        }
        onRowClick={(row) =>
          navigate({
            to: "/purchases/receipts/$id",
            params: { id: row.id },
          })
        }
        loading={isPending}
        emptyFirstUse={{
          title: m.receipt_list_empty_first_use_title(),
          description: m.receipt_list_empty_first_use_description(),
          action: (
            <Button onClick={() => navigate({ to: "/purchases/receipts/new" })}>
              {m.receipt_list_new()}
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
