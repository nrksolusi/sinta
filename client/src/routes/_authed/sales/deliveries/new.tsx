import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { api } from "@/lib/api";
import { warehousesQueryOptions } from "@/lib/catalog";
import { pickerProductsQueryOptions } from "@/lib/pickers-data";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import { salesOrderToDraftSeed } from "./-deliveries-data";
import {
  DeliveryDraftForm,
  type DeliveryDraftValues,
  type DeliveryPayload,
  emptyDraft,
} from "./-delivery-draft-form";

// CREATE-FROM-SOURCE CONTRACT (deliver-from-SO)
// ---------------------------------------------
// `/sales/deliveries/new` accepts an optional `?salesOrderId=` search param.
// When present the page fetches `/sales-orders/{id}` and pre-fills the draft:
//   - customer  <- sales order customerId
//   - gudang    <- sales order warehouseId
//   - lines     <- one grid line per SO line, default qty = ordered qty, with
//                  salesOrderLineId set so the server can link fulfilment.
// Short deliveries just post short (M1); the remaining qty surfaces on the SO
// (the SO wave computes it client-side from linked deliveries). Lines whose
// product is missing from the active catalog are dropped. Without the param the
// page starts from an empty draft. The SO wave depends on this contract: it
// links to `/sales/deliveries/new?salesOrderId=$id` from a posted SO.
export const Route = createFileRoute("/_authed/sales/deliveries/new")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { salesOrderId?: string } => ({
    salesOrderId:
      typeof search.salesOrderId === "string" ? search.salesOrderId : undefined,
  }),
  component: NewDeliveryPage,
});

function NewDeliveryPage() {
  const { salesOrderId } = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const { data: products = [] } = useQuery(pickerProductsQueryOptions);

  const { data: salesOrder } = useQuery({
    queryKey: ["sales-order", salesOrderId],
    queryFn: async () => {
      if (!salesOrderId) return null;
      const { data } = await api.GET("/sales-orders/{id}", {
        params: { path: { id: salesOrderId } },
      });
      return data ?? null;
    },
    enabled: !!salesOrderId,
  });

  const seed = useMemo(
    () =>
      salesOrder ? salesOrderToDraftSeed(salesOrder, products) : undefined,
    [salesOrder, products],
  );

  const initial: DeliveryDraftValues = useMemo(() => {
    if (!seed) return emptyDraft();
    return {
      ...emptyDraft(),
      customerId: seed.customerId,
      warehouseId: seed.warehouseId,
      lines: seed.lines,
    };
  }, [seed]);

  const create = async (payload: DeliveryPayload) => {
    const { data } = await api.POST("/deliveries", {
      body: {
        customerId: payload.customerId,
        warehouseId: payload.warehouseId,
        docDate: payload.docDate,
        notes: payload.notes || undefined,
        salesOrderId: salesOrderId ?? undefined,
        lines: payload.lines,
      },
    });
    return data ?? null;
  };

  const saveDraft = async (payload: DeliveryPayload) => {
    const draft = await create(payload);
    if (!draft) {
      toast.error(m.delivery_save_failed());
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    toast.success(m.delivery_saved());
    navigate({ to: "/sales/deliveries/$id", params: { id: draft.id } });
  };

  const post = async (payload: DeliveryPayload) => {
    const draft = await create(payload);
    if (!draft) {
      toast.error(m.delivery_save_failed());
      return;
    }
    const { data: posted } = await api.POST("/deliveries/{id}/post", {
      params: { path: { id: draft.id } },
    });
    await queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    if (!posted) {
      // The draft exists; send the user to it so they can retry posting.
      toast.error(m.delivery_post_failed());
      navigate({ to: "/sales/deliveries/$id", params: { id: draft.id } });
      return;
    }
    toast.success(m.delivery_posted({ number: posted.docNumber ?? "" }));
    navigate({ to: "/sales/deliveries/$id", params: { id: posted.id } });
  };

  // Force a fresh form once the async SO seed resolves (defaultValues are
  // captured on mount otherwise).
  const formKey = seed ? `so-${salesOrderId}` : "blank";

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/sales/deliveries">
              {m.delivery_list_title()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{m.delivery_new_breadcrumb()}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-lg font-semibold tracking-tight">
        {m.delivery_new_title()}
      </h1>

      <DeliveryDraftForm
        key={formKey}
        initial={initial}
        warehouses={warehouses}
        salesOrderLineIds={seed?.salesOrderLineIds}
        sourceLabel={
          salesOrder
            ? m.delivery_source_order({
                number: salesOrder.docNumber ?? salesOrder.id,
              })
            : undefined
        }
        onSaveDraft={saveDraft}
        onPost={post}
        saving={false}
        posting={false}
      />
    </div>
  );
}
