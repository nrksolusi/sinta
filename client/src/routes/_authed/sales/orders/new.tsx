import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
import { partnersQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import {
  emptyDraft,
  SalesOrderDraftForm,
  type SalesOrderPayload,
} from "./-sales-order-draft-form";

export const Route = createFileRoute("/_authed/sales/orders/new")({
  component: NewSalesOrderPage,
});

function NewSalesOrderPage() {
  const navigate = Route.useNavigate();

  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const { data: customers = [] } = useQuery(partnersQueryOptions("customer"));

  const create = async (payload: SalesOrderPayload) => {
    const { data } = await api.POST("/sales-orders", {
      body: {
        customerId: payload.customerId,
        warehouseId: payload.warehouseId,
        docDate: payload.docDate,
        notes: payload.notes || undefined,
        lines: payload.lines,
      },
    });
    return data ?? null;
  };

  const saveDraft = async (payload: SalesOrderPayload) => {
    const draft = await create(payload);
    if (!draft) {
      toast.error(m.so_save_failed());
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    toast.success(m.so_saved());
    navigate({ to: "/sales/orders/$id", params: { id: draft.id } });
  };

  const post = async (payload: SalesOrderPayload) => {
    const draft = await create(payload);
    if (!draft) {
      toast.error(m.so_save_failed());
      return;
    }
    const { data: posted } = await api.POST("/sales-orders/{id}/post", {
      params: { path: { id: draft.id } },
    });
    await queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    if (!posted) {
      toast.error(m.so_post_failed());
      navigate({ to: "/sales/orders/$id", params: { id: draft.id } });
      return;
    }
    toast.success(m.so_posted({ number: posted.docNumber ?? "" }));
    navigate({ to: "/sales/orders/$id", params: { id: posted.id } });
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/sales/orders">
              {m.so_list_title()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{m.so_new_breadcrumb()}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-lg font-semibold tracking-tight">
        {m.so_new_title()}
      </h1>

      <SalesOrderDraftForm
        initial={emptyDraft()}
        warehouses={warehouses}
        customers={customers}
        onSaveDraft={saveDraft}
        onPost={post}
        saving={false}
        posting={false}
      />
    </div>
  );
}
