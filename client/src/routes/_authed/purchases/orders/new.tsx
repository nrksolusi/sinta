import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { api } from "@/lib/api";
import {
  pickerPartnersQueryOptions,
  pickerWarehousesQueryOptions,
} from "@/lib/pickers-data";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import { draftToPayload, type OrderDraft } from "./-order-data";
import { OrderDraftEditor } from "./-order-editor";

export const Route = createFileRoute("/_authed/purchases/orders/new")({
  component: NewOrderPage,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): OrderDraft {
  return {
    supplierId: "",
    warehouseId: "",
    docDate: today(),
    notes: "",
    lines: [],
  };
}

function NewOrderPage() {
  const navigate = useNavigate();

  const { data: warehouses = [] } = useQuery(pickerWarehousesQueryOptions);
  const { data: suppliers = [] } = useQuery(
    pickerPartnersQueryOptions("supplier"),
  );

  const [draft, setDraft] = useState<OrderDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);
  // Guard so the one-time default-warehouse prefill doesn't clobber edits.
  const [prefilled, setPrefilled] = useState(false);

  const supplierName = useMemo(() => {
    const byId = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: string) => byId.get(id) ?? id;
  }, [suppliers]);

  // Preselect the sole/default warehouse on a blank draft.
  useEffect(() => {
    if (prefilled) return;
    if (warehouses.length === 1 && !draft.warehouseId) {
      setDraft((d) => ({ ...d, warehouseId: warehouses[0].id }));
      setPrefilled(true);
    }
  }, [prefilled, warehouses, draft.warehouseId]);

  async function saveDraft(): Promise<string | null> {
    setSaving(true);
    try {
      const { data } = await api.POST("/purchase-orders", {
        body: draftToPayload(draft),
      });
      if (!data) {
        toast.error(m.po_save_failed());
        return null;
      }
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      return data.id;
    } finally {
      setSaving(false);
    }
  }

  async function onSaveDraft() {
    const id = await saveDraft();
    if (id) {
      toast.success(m.po_draft_saved());
      navigate({ to: "/purchases/orders/$id", params: { id } });
    }
  }

  // Post = save the draft, then post it, then land on the record detail.
  async function onPost() {
    setPosting(true);
    try {
      const id = await saveDraft();
      if (!id) return;
      const { data } = await api.POST("/purchase-orders/{id}/post", {
        params: { path: { id } },
      });
      if (!data) {
        toast.error(m.doc_post_failed());
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setPostConfirmOpen(false);
      navigate({ to: "/purchases/orders/$id", params: { id } });
    } finally {
      setPosting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/purchases/orders">
              {m.po_breadcrumb_orders()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{m.po_title_new()}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.po_title_new()}
        </h1>
        <StatusBadge status="draft" />
      </div>

      <OrderDraftEditor
        draft={draft}
        onChange={setDraft}
        onSaveDraft={onSaveDraft}
        onPost={onPost}
        saving={saving}
        posting={posting}
        postConfirmOpen={postConfirmOpen}
        onPostConfirmOpenChange={setPostConfirmOpen}
        supplierName={supplierName}
      />
    </main>
  );
}
