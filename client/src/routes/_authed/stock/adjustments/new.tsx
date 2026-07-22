import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { pickerWarehousesQueryOptions } from "@/lib/pickers-data";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import { type AdjustmentDraft, AdjustmentForm } from "./-adjustment-form";
import {
  adjustmentNetEffect,
  draftUnavailableReason,
  gridLinesToPayload,
} from "./-adjustments-data";

export const Route = createFileRoute("/_authed/stock/adjustments/new")({
  component: NewAdjustmentPage,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const UNAVAILABLE_LABEL = {
  warehouse: () => m.adjustment_unavailable_warehouse(),
  reason: () => m.adjustment_unavailable_reason(),
  lines: () => m.adjustment_unavailable_lines(),
} as const;

// Unsaved draft entry. "Simpan draf" creates the draft and lands on its detail
// page; "Posting" creates then posts, after a ConfirmDialog restating the
// warehouse, line count, and net signed effect.
function NewAdjustmentPage() {
  const router = useRouter();
  const { data: warehouses = [] } = useQuery(pickerWarehousesQueryOptions);

  const [draft, setDraft] = useState<AdjustmentDraft>({
    warehouseId: "",
    reason: "",
    docDate: today(),
    lines: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [confirmingPost, setConfirmingPost] = useState(false);

  // Preselect the sole warehouse (matches the document-picker convention).
  const soleWarehouseId =
    warehouses.length === 1 ? warehouses[0].id : undefined;
  const effectiveWarehouseId = draft.warehouseId || soleWarehouseId || "";

  const warehouse = warehouses.find((w) => w.id === effectiveWarehouseId);
  const warehouseLabel = warehouse
    ? `${warehouse.code} ${warehouse.name}`
    : undefined;

  const blocker = draftUnavailableReason({
    warehouseId: effectiveWarehouseId,
    reason: draft.reason,
    lines: draft.lines,
  });
  const netEffect = useMemo(
    () => adjustmentNetEffect(draft.lines),
    [draft.lines],
  );

  const createDraft = async () => {
    const { data } = await api.POST("/stock-adjustments", {
      body: {
        warehouseId: effectiveWarehouseId,
        reason: draft.reason,
        docDate: draft.docDate,
        lines: gridLinesToPayload(draft.lines),
      },
    });
    if (!data) {
      toast.error(m.doc_create_failed());
      return null;
    }
    await queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
    return data;
  };

  const saveDraft = async () => {
    setSubmitting(true);
    try {
      const created = await createDraft();
      if (!created) return;
      toast.success(m.adjustment_draft_saved());
      await router.navigate({
        to: "/stock/adjustments/$id",
        params: { id: created.id },
      });
    } finally {
      setSubmitting(false);
    }
  };

  const post = async () => {
    setSubmitting(true);
    try {
      const created = await createDraft();
      if (!created) return;
      const { data: posted } = await api.POST("/stock-adjustments/{id}/post", {
        params: { path: { id: created.id } },
      });
      if (!posted) {
        // The draft was saved; send the user to it so no work is lost.
        toast.error(m.doc_post_failed());
        await router.navigate({
          to: "/stock/adjustments/$id",
          params: { id: created.id },
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });
      toast.success(m.doc_posted({ number: posted.docNumber ?? "" }));
      await router.navigate({
        to: "/stock/adjustments/$id",
        params: { id: posted.id },
      });
    } finally {
      setSubmitting(false);
      setConfirmingPost(false);
    }
  };

  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/stock/adjustments">
              {m.adjustment_breadcrumb_list()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{m.adjustment_new_title()}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.adjustment_new_title()}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={submitting || blocker != null}
            onClick={saveDraft}
          >
            {m.adjustment_action_save_draft()}
          </Button>
          <Button
            disabled={submitting || blocker != null}
            onClick={() => setConfirmingPost(true)}
          >
            {m.action_post()}
          </Button>
        </div>
      </div>

      {blocker && (
        <p className="text-xs text-muted-foreground">
          {UNAVAILABLE_LABEL[blocker]()}
        </p>
      )}

      <AdjustmentForm
        value={{ ...draft, warehouseId: effectiveWarehouseId }}
        onChange={setDraft}
        warehouseLabel={warehouseLabel}
      />

      <ConfirmDialog
        open={confirmingPost}
        onOpenChange={setConfirmingPost}
        title={m.adjustment_post_confirm_title()}
        specifics={m.adjustment_post_confirm_specifics({
          warehouse: warehouseLabel ?? "",
          count: draft.lines.length,
          increase: formatNumber(netEffect.increase),
          decrease: formatNumber(netEffect.decrease),
        })}
        confirmLabel={m.action_post()}
        onConfirm={post}
        pending={submitting}
      />
    </main>
  );
}
