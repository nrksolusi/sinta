import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LineGrid, lineGridTotals } from "@/components/line-grid";
import { RecordShell, type TimelineEntry } from "@/components/record-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { partnersQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { pickerProductsQueryOptions } from "@/lib/pickers-data";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import {
  type Delivery,
  deliveryLinesToGrid,
  deliveryQueryOptions,
  deliveryTotalQty,
} from "./-deliveries-data";
import {
  DeliveryDraftForm,
  type DeliveryPayload,
} from "./-delivery-draft-form";

export const Route = createFileRoute("/_authed/sales/deliveries/$id")({
  component: DeliveryDetailPage,
});

// Status-based timeline. The API carries no per-transition timestamps yet, so
// each reached state contributes one entry dated by the document date; this
// keeps the RecordShell timeline populated without inventing precise times.
function timeline(delivery: Delivery): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      action: m.delivery_timeline_created(),
      actor: "",
      at: delivery.docDate,
    },
  ];
  if (delivery.status === "posted" || delivery.status === "reversed") {
    entries.unshift({
      action: m.delivery_timeline_posted(),
      actor: "",
      at: delivery.docDate,
    });
  }
  if (delivery.status === "reversed") {
    entries.unshift({
      action: m.delivery_timeline_reversed(),
      actor: "",
      at: delivery.docDate,
    });
  }
  return entries;
}

function DeliveryDetailPage() {
  const { id } = Route.useParams();
  const navigate = Route.useNavigate();

  const { data: delivery, isPending } = useQuery(deliveryQueryOptions(id));
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const { data: customers = [] } = useQuery(partnersQueryOptions("customer"));
  const { data: products = [] } = useQuery(pickerProductsQueryOptions);

  const [confirmReverse, setConfirmReverse] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  const gridLines = useMemo(
    () => (delivery ? deliveryLinesToGrid(delivery.lines, products) : []),
    [delivery, products],
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-muted-foreground">
          {m.delivery_not_found()}
        </p>
      </div>
    );
  }

  const customer = customers.find((c) => c.id === delivery.customerId);
  const warehouse = warehouses.find((w) => w.id === delivery.warehouseId);
  const warehouseLabel = warehouse
    ? `${warehouse.code} ${warehouse.name}`
    : delivery.warehouseId;

  const breadcrumb = [
    { label: m.delivery_list_title(), to: "/sales/deliveries" },
    { label: delivery.docNumber ?? m.status_draft() },
  ];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    await queryClient.invalidateQueries({ queryKey: ["delivery", id] });
  };

  // --- Draft: editable form (Simpan draf / Posting / Hapus draf) -------------
  if (delivery.status === "draft") {
    const saveDraft = async (payload: DeliveryPayload) => {
      setSaving(true);
      try {
        const { data } = await api.PUT("/deliveries/{id}", {
          params: { path: { id } },
          body: {
            customerId: payload.customerId,
            warehouseId: payload.warehouseId,
            docDate: payload.docDate,
            notes: payload.notes || undefined,
            salesOrderId: delivery.salesOrderId ?? undefined,
            lines: payload.lines,
          },
        });
        if (!data) {
          toast.error(m.delivery_save_failed());
          return;
        }
        await invalidate();
        toast.success(m.delivery_saved());
      } finally {
        setSaving(false);
      }
    };

    const post = async (payload: DeliveryPayload) => {
      setPosting(true);
      try {
        await api.PUT("/deliveries/{id}", {
          params: { path: { id } },
          body: {
            customerId: payload.customerId,
            warehouseId: payload.warehouseId,
            docDate: payload.docDate,
            notes: payload.notes || undefined,
            salesOrderId: delivery.salesOrderId ?? undefined,
            lines: payload.lines,
          },
        });
        const { data: posted } = await api.POST("/deliveries/{id}/post", {
          params: { path: { id } },
        });
        await invalidate();
        if (!posted) {
          toast.error(m.delivery_post_failed());
          return;
        }
        toast.success(m.delivery_posted({ number: posted.docNumber ?? "" }));
      } finally {
        setPosting(false);
      }
    };

    return (
      <RecordShell
        breadcrumb={breadcrumb}
        title={m.status_draft()}
        status="draft"
        // Hapus draf omitted at M1: the API exposes no draft-delete endpoint on
        // documents (documents.yaml has post/put/post-post/post-reverse only).
        // The prototype reserves the action; it lands when the endpoint does.
        actions={null}
        timeline={timeline(delivery)}
      >
        <DeliveryDraftForm
          initial={{
            customerId: delivery.customerId,
            warehouseId: delivery.warehouseId,
            docDate: delivery.docDate,
            notes: delivery.notes ?? "",
            lines: gridLines,
          }}
          warehouses={warehouses}
          sourceLabel={
            delivery.salesOrderId
              ? m.delivery_source_order({ number: delivery.salesOrderId })
              : undefined
          }
          onSaveDraft={saveDraft}
          onPost={post}
          saving={saving}
          posting={posting}
        />
      </RecordShell>
    );
  }

  // --- Posted / reversed: read-only record ----------------------------------
  const reverse = async () => {
    setReversing(true);
    try {
      const { data } = await api.POST("/deliveries/{id}/reverse", {
        params: { path: { id } },
      });
      await invalidate();
      if (data) {
        await queryClient.invalidateQueries({
          queryKey: ["delivery", data.id],
        });
        toast.success(m.delivery_reversed({ number: data.docNumber ?? "" }));
        navigate({ to: "/sales/deliveries/$id", params: { id } });
      } else {
        toast.error(m.delivery_reverse_failed());
      }
    } finally {
      setReversing(false);
      setConfirmReverse(false);
    }
  };

  const isReversed = delivery.status === "reversed";

  return (
    <RecordShell
      breadcrumb={breadcrumb}
      title={
        <span className="font-mono">
          {delivery.docNumber ?? m.status_draft()}
        </span>
      }
      status={delivery.status}
      banner={
        isReversed && delivery.reversedById ? (
          <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm">
            <Link
              to="/sales/deliveries/$id"
              params={{ id: delivery.reversedById }}
              className="underline underline-offset-4"
            >
              {m.delivery_reversed_by_link({ number: delivery.reversedById })}
            </Link>
          </div>
        ) : undefined
      }
      actions={
        isReversed ? null : (
          <>
            <span className="text-xs text-muted-foreground">
              {m.delivery_print_hint()}
            </span>
            <Button variant="outline" disabled>
              {m.delivery_action_print()}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmReverse(true)}
            >
              {m.delivery_action_reverse()}
            </Button>
          </>
        )
      }
      timeline={timeline(delivery)}
    >
      <Card size="sm" className="px-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">
              {m.delivery_field_customer()}
            </dt>
            <dd>{customer?.name ?? delivery.customerId}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {m.delivery_field_warehouse()}
            </dt>
            <dd className="font-mono">{warehouseLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {m.delivery_field_date()}
            </dt>
            <dd className="tabular-nums">{delivery.docDate}</dd>
          </div>
          {delivery.salesOrderId && (
            <div>
              <dt className="text-xs text-muted-foreground">
                {m.delivery_field_source()}
              </dt>
              <dd className="font-mono">{delivery.salesOrderId}</dd>
            </div>
          )}
          {delivery.notes && (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-xs text-muted-foreground">
                {m.delivery_field_notes()}
              </dt>
              <dd>{delivery.notes}</dd>
            </div>
          )}
        </dl>
      </Card>

      <LineGrid
        lines={gridLines}
        onChange={() => {}}
        withCost={false}
        qtyLabel={m.delivery_qty_label()}
        readOnly
        totals={lineGridTotals(gridLines, { withCost: false })}
      />

      {!isReversed && (
        <p className="text-sm text-muted-foreground">
          {m.record_posted_notice()}
        </p>
      )}

      {isReversed && delivery.reversesId && (
        <p className="text-sm">
          <Link
            to="/sales/deliveries/$id"
            params={{ id: delivery.reversesId }}
            className="underline underline-offset-4"
          >
            {m.delivery_reverses_link({ number: delivery.reversesId })}
          </Link>
        </p>
      )}

      <ConfirmDialog
        open={confirmReverse}
        onOpenChange={setConfirmReverse}
        title={m.delivery_reverse_confirm_title()}
        specifics={m.delivery_reverse_confirm_specifics({
          number: delivery.docNumber ?? "",
          lines: delivery.lines.length,
          qty: formatNumber(deliveryTotalQty(delivery.lines)),
          warehouse: warehouseLabel,
        })}
        confirmLabel={m.delivery_action_reverse()}
        destructive
        pending={reversing}
        onConfirm={reverse}
      />
    </RecordShell>
  );
}
