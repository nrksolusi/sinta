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
import type { components } from "@/lib/api-types";
import {
  pickerProductsQueryOptions,
  pickerWarehousesQueryOptions,
} from "@/lib/pickers-data";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import {
  draftToPayload,
  poToDraftLines,
  type ReceiptDraft,
} from "./-receipt-data";
import { ReceiptDraftEditor } from "./-receipt-editor";

type Product = components["schemas"]["Product"];

// CREATE-FROM-SOURCE CONTRACT
// ---------------------------
// /purchases/receipts/new accepts one optional search param:
//
//   ?purchaseOrderId=<uuid>
//
// When present, the route fetches GET /purchase-orders/{id} and pre-fills the
// unsaved draft from it: supplier and warehouse copied from the PO header, and
// one grid line per PO line. Each prefilled line carries its source
// purchaseOrderLineId, and its qty defaults to the ordered qty. Short receipts
// are allowed - the user may lower any qty and post short (M1). PO lines whose
// product is unavailable in the active picker list are skipped. Without the
// param, the route opens a blank draft with the default warehouse preselected.
export const Route = createFileRoute("/_authed/purchases/receipts/new")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { purchaseOrderId?: string } => ({
    purchaseOrderId:
      typeof search.purchaseOrderId === "string"
        ? search.purchaseOrderId
        : undefined,
  }),
  component: NewReceiptPage,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): ReceiptDraft {
  return {
    supplierId: "",
    warehouseId: "",
    docDate: today(),
    notes: "",
    purchaseOrderId: null,
    lines: [],
  };
}

function NewReceiptPage() {
  const { purchaseOrderId } = Route.useSearch();
  const navigate = useNavigate();

  const { data: warehouses = [] } = useQuery(pickerWarehousesQueryOptions);
  const { data: products = [] } = useQuery(pickerProductsQueryOptions);

  // The source PO, only when the create-from-source param is set.
  const { data: sourcePo } = useQuery({
    queryKey: ["purchase-order", purchaseOrderId],
    enabled: Boolean(purchaseOrderId),
    queryFn: async () => {
      if (!purchaseOrderId) return null;
      const { data } = await api.GET("/purchase-orders/{id}", {
        params: { path: { id: purchaseOrderId } },
      });
      return data ?? null;
    },
  });

  const [draft, setDraft] = useState<ReceiptDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);
  // Guard so the one-time prefills (default warehouse / PO) don't clobber edits.
  const [prefilled, setPrefilled] = useState(false);

  const productById = useMemo(() => {
    const byId = new Map<string, Product>(products.map((p) => [p.id, p]));
    return (id: string) => byId.get(id);
  }, [products]);

  const warehouseName = useMemo(() => {
    const byId = new Map(warehouses.map((w) => [w.id, w.name]));
    return (id: string) => byId.get(id) ?? id;
  }, [warehouses]);

  // Preselect the sole/default warehouse on a blank draft.
  useEffect(() => {
    if (prefilled || purchaseOrderId) return;
    if (warehouses.length === 1 && !draft.warehouseId) {
      setDraft((d) => ({ ...d, warehouseId: warehouses[0].id }));
      setPrefilled(true);
    }
  }, [prefilled, purchaseOrderId, warehouses, draft.warehouseId]);

  // Prefill from the source PO once it resolves.
  useEffect(() => {
    if (prefilled || !purchaseOrderId || !sourcePo || products.length === 0) {
      return;
    }
    setDraft((d) => ({
      ...d,
      supplierId: sourcePo.supplierId,
      warehouseId: sourcePo.warehouseId,
      purchaseOrderId: sourcePo.id,
      lines: poToDraftLines(sourcePo, productById),
    }));
    setPrefilled(true);
  }, [prefilled, purchaseOrderId, sourcePo, products.length, productById]);

  async function saveDraft(): Promise<string | null> {
    setSaving(true);
    try {
      const { data } = await api.POST("/goods-receipts", {
        body: draftToPayload(draft),
      });
      if (!data) {
        toast.error(m.receipt_save_failed());
        return null;
      }
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      return data.id;
    } finally {
      setSaving(false);
    }
  }

  async function onSaveDraft() {
    const id = await saveDraft();
    if (id) {
      toast.success(m.receipt_draft_saved());
      navigate({ to: "/purchases/receipts/$id", params: { id } });
    }
  }

  // Post = save the draft, then post it, then land on the record detail.
  async function onPost() {
    setPosting(true);
    try {
      const id = await saveDraft();
      if (!id) return;
      const { data } = await api.POST("/goods-receipts/{id}/post", {
        params: { path: { id } },
      });
      if (!data) {
        toast.error(m.doc_post_failed());
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      setPostConfirmOpen(false);
      navigate({ to: "/purchases/receipts/$id", params: { id } });
    } finally {
      setPosting(false);
    }
  }

  const poNotice =
    purchaseOrderId && sourcePo ? (
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {m.receipt_from_po_notice({
          number: sourcePo.docNumber ?? sourcePo.id,
        })}
      </div>
    ) : undefined;

  return (
    <main className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/purchases/receipts">
              {m.receipt_breadcrumb_receipts()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{m.receipt_title_new()}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.receipt_title_new()}
        </h1>
        <StatusBadge status="draft" />
      </div>

      <ReceiptDraftEditor
        draft={draft}
        onChange={setDraft}
        poNotice={poNotice}
        onSaveDraft={onSaveDraft}
        onPost={onPost}
        saving={saving}
        posting={posting}
        postConfirmOpen={postConfirmOpen}
        onPostConfirmOpenChange={setPostConfirmOpen}
        warehouseName={warehouseName}
      />
    </main>
  );
}
