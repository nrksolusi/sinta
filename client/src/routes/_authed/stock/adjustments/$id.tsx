import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { LineGrid, lineGridTotals } from "@/components/line-grid";
import { RecordShell, type TimelineEntry } from "@/components/record-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { Product, Warehouse } from "@/lib/pickers-data";
import {
  pickerProductsQueryOptions,
  pickerWarehousesQueryOptions,
} from "@/lib/pickers-data";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import { type AdjustmentDraft, AdjustmentForm } from "./-adjustment-form";
import {
  adjustmentNetEffect,
  draftUnavailableReason,
  gridLinesToPayload,
  linesFromAdjustment,
  type StockAdjustment,
} from "./-adjustments-data";

export const Route = createFileRoute("/_authed/stock/adjustments/$id")({
  component: AdjustmentDetailPage,
});

const UNAVAILABLE_LABEL = {
  warehouse: () => m.adjustment_unavailable_warehouse(),
  reason: () => m.adjustment_unavailable_reason(),
  lines: () => m.adjustment_unavailable_lines(),
} as const;

type NavigateFn = (opts: {
  to: string;
  params?: Record<string, string>;
}) => Promise<void>;

async function invalidate(id: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] }),
    queryClient.invalidateQueries({ queryKey: ["stock-adjustment", id] }),
  ]);
}

function warehouseLabelFor(
  warehouses: Warehouse[],
  warehouseId: string,
): string {
  const w = warehouses.find((x) => x.id === warehouseId);
  return w ? `${w.code} ${w.name}` : warehouseId;
}

function timelineFor(adjustment: StockAdjustment): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      action: m.adjustment_timeline_created(),
      actor: "",
      at: adjustment.docDate,
    },
  ];
  if (adjustment.status === "posted" || adjustment.status === "reversed") {
    entries.unshift({
      action: m.adjustment_timeline_posted(),
      actor: "",
      at: adjustment.docDate,
    });
  }
  if (adjustment.status === "reversed") {
    entries.unshift({
      action: m.adjustment_timeline_reversed(),
      actor: "",
      at: adjustment.docDate,
    });
  }
  return entries;
}

function AdjustmentDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();

  const { data: adjustment, isPending } = useQuery({
    queryKey: ["stock-adjustment", id],
    queryFn: async (): Promise<StockAdjustment | null> => {
      const { data } = await api.GET("/stock-adjustments/{id}", {
        params: { path: { id } },
      });
      return data ?? null;
    },
  });
  const { data: warehouses = [] } = useQuery(pickerWarehousesQueryOptions);
  const { data: products = [] } = useQuery(pickerProductsQueryOptions);

  if (isPending) {
    return (
      <div className="p-4 md:p-6" aria-busy="true">
        <div className="h-11 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (!adjustment) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          variant="first-use"
          title={m.adjustment_not_found()}
          description={m.adjustment_load_failed()}
        />
      </div>
    );
  }

  const navigate: NavigateFn = (opts) =>
    router.navigate(opts as Parameters<typeof router.navigate>[0]);

  if (adjustment.status === "draft") {
    return (
      <DraftDetail
        adjustment={adjustment}
        products={products}
        warehouses={warehouses}
      />
    );
  }

  return (
    <PostedDetail
      adjustment={adjustment}
      products={products}
      warehouses={warehouses}
      onNavigate={navigate}
    />
  );
}

function DraftDetail({
  adjustment,
  products,
  warehouses,
}: {
  adjustment: StockAdjustment;
  products: Product[];
  warehouses: Warehouse[];
}) {
  const [draft, setDraft] = useState<AdjustmentDraft>(() => ({
    warehouseId: adjustment.warehouseId,
    reason: adjustment.reason,
    docDate: adjustment.docDate,
    lines: linesFromAdjustment(adjustment, products),
  }));
  const [submitting, setSubmitting] = useState(false);
  const [confirmingPost, setConfirmingPost] = useState(false);

  const warehouseLabel = draft.warehouseId
    ? warehouseLabelFor(warehouses, draft.warehouseId)
    : undefined;
  const blocker = draftUnavailableReason(draft);
  const netEffect = useMemo(
    () => adjustmentNetEffect(draft.lines),
    [draft.lines],
  );

  const persist = async (): Promise<StockAdjustment | null> => {
    const { data } = await api.PUT("/stock-adjustments/{id}", {
      params: { path: { id: adjustment.id } },
      body: {
        warehouseId: draft.warehouseId,
        reason: draft.reason,
        docDate: draft.docDate,
        lines: gridLinesToPayload(draft.lines),
      },
    });
    if (!data) {
      toast.error(m.doc_create_failed());
      return null;
    }
    await invalidate(adjustment.id);
    return data;
  };

  const saveDraft = async () => {
    setSubmitting(true);
    try {
      const saved = await persist();
      if (saved) toast.success(m.adjustment_draft_saved());
    } finally {
      setSubmitting(false);
    }
  };

  const post = async () => {
    setSubmitting(true);
    try {
      const saved = await persist();
      if (!saved) return;
      const { data: posted } = await api.POST("/stock-adjustments/{id}/post", {
        params: { path: { id: adjustment.id } },
      });
      if (!posted) {
        toast.error(m.doc_post_failed());
        return;
      }
      await invalidate(adjustment.id);
      toast.success(m.doc_posted({ number: posted.docNumber ?? "" }));
    } finally {
      setSubmitting(false);
      setConfirmingPost(false);
    }
  };

  return (
    <>
      <RecordShell
        breadcrumb={[
          { label: m.adjustment_breadcrumb_list(), to: "/stock/adjustments" },
          { label: m.adjustment_title_draft() },
        ]}
        title={m.adjustment_title_draft()}
        status="draft"
        actions={
          <>
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
          </>
        }
        timeline={timelineFor(adjustment)}
      >
        {blocker && (
          <p className="text-xs text-muted-foreground">
            {UNAVAILABLE_LABEL[blocker]()}
          </p>
        )}
        <AdjustmentForm
          value={draft}
          onChange={setDraft}
          warehouseLabel={warehouseLabel}
        />
      </RecordShell>

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
    </>
  );
}

function PostedDetail({
  adjustment,
  products,
  warehouses,
  onNavigate,
}: {
  adjustment: StockAdjustment;
  products: Product[];
  warehouses: Warehouse[];
  onNavigate: NavigateFn;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [confirmingReverse, setConfirmingReverse] = useState(false);

  const lines = useMemo(
    () => linesFromAdjustment(adjustment, products),
    [adjustment, products],
  );
  const totals = lineGridTotals(lines, { withCost: true, signedQty: true });
  const netEffect = useMemo(() => adjustmentNetEffect(lines), [lines]);
  const warehouseLabel = warehouseLabelFor(warehouses, adjustment.warehouseId);
  const reversed = adjustment.status === "reversed";

  const reverse = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.POST("/stock-adjustments/{id}/reverse", {
        params: { path: { id: adjustment.id } },
      });
      if (!data) {
        toast.error(m.adjustment_reverse_failed());
        return;
      }
      await invalidate(adjustment.id);
      toast.success(m.adjustment_reversed());
      await onNavigate({
        to: "/stock/adjustments/$id",
        params: { id: data.id },
      });
    } finally {
      setSubmitting(false);
      setConfirmingReverse(false);
    }
  };

  const banner = reversed ? (
    <ReversalBanner
      text={m.adjustment_reversed_banner()}
      linkLabel={m.adjustment_reversed_link()}
      targetId={adjustment.reversedById}
    />
  ) : adjustment.reversesId ? (
    <ReversalBanner
      text={m.adjustment_reverses_banner()}
      linkLabel={m.adjustment_reverses_link()}
      targetId={adjustment.reversesId}
    />
  ) : undefined;

  return (
    <>
      <RecordShell
        breadcrumb={[
          { label: m.adjustment_breadcrumb_list(), to: "/stock/adjustments" },
          {
            label: (
              <span className="font-mono">{adjustment.docNumber ?? ""}</span>
            ),
          },
        ]}
        title={<span className="font-mono">{adjustment.docNumber ?? ""}</span>}
        status={reversed ? "reversed" : "posted"}
        actions={
          reversed ? null : (
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirmingReverse(true)}
            >
              {m.adjustment_action_cancel_doc()}
            </Button>
          )
        }
        banner={banner}
        timeline={timelineFor(adjustment)}
      >
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{m.field_warehouse()}:</dt>
            <dd className="font-mono">{warehouseLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">
              {m.adjustment_field_reason()}:
            </dt>
            <dd>{adjustment.reason}</dd>
          </div>
        </dl>

        <LineGrid
          lines={lines}
          onChange={() => {}}
          withCost
          signedQty
          qtyLabel={m.adjustment_qty_label()}
          readOnly
          totals={totals}
        />

        {!reversed && (
          <p className="text-xs text-muted-foreground">
            {m.adjustment_posted_notice()}
          </p>
        )}
      </RecordShell>

      <ConfirmDialog
        open={confirmingReverse}
        onOpenChange={setConfirmingReverse}
        title={m.adjustment_reverse_confirm_title()}
        specifics={m.adjustment_reverse_confirm_specifics({
          number: adjustment.docNumber ?? "",
          count: lines.length,
          increase: formatNumber(netEffect.increase),
          decrease: formatNumber(netEffect.decrease),
        })}
        confirmLabel={m.adjustment_action_cancel_doc()}
        onConfirm={reverse}
        destructive
        pending={submitting}
      />
    </>
  );
}

// Banner for a reversed doc (links to the reversal) or a reversal doc (links
// back to the original). The linked doc's number is resolved by the link target.
function ReversalBanner({
  text,
  linkLabel,
  targetId,
}: {
  text: string;
  linkLabel: string;
  targetId?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <span>{text}</span>
      {targetId && (
        <Link
          to="/stock/adjustments/$id"
          params={{ id: targetId }}
          className="underline underline-offset-4"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
