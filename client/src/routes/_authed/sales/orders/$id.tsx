import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { lineGridTotals } from "@/components/line-grid";
import { RecordShell, type TimelineEntry } from "@/components/record-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { partnersQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { pickerProductsQueryOptions } from "@/lib/pickers-data";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import {
  type Delivery,
  deliveriesForOrdersQueryOptions,
  type LineFulfillment,
  lineFulfillment,
  linkedDeliveries,
  type SalesOrder,
  salesOrderLinesToGrid,
  salesOrderQueryOptions,
  salesOrderTotal,
} from "./-sales-order-data";
import {
  SalesOrderDraftForm,
  type SalesOrderPayload,
} from "./-sales-order-draft-form";

export const Route = createFileRoute("/_authed/sales/orders/$id")({
  component: SalesOrderDetailPage,
});

// Status-based timeline. The API carries no per-transition timestamps yet, so
// each reached state contributes one entry dated by the document date.
function timeline(order: SalesOrder): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { action: m.so_timeline_created(), actor: "", at: order.docDate },
  ];
  if (order.status === "posted" || order.status === "reversed") {
    entries.unshift({
      action: m.so_timeline_posted(),
      actor: "",
      at: order.docDate,
    });
  }
  if (order.status === "reversed") {
    entries.unshift({
      action: m.so_timeline_reversed(),
      actor: "",
      at: order.docDate,
    });
  }
  return entries;
}

function SalesOrderDetailPage() {
  const { id } = Route.useParams();
  const navigate = Route.useNavigate();

  const { data: order, isPending } = useQuery(salesOrderQueryOptions(id));
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const { data: customers = [] } = useQuery(partnersQueryOptions("customer"));
  const { data: products = [] } = useQuery(pickerProductsQueryOptions);
  const { data: deliveries = [] } = useQuery(deliveriesForOrdersQueryOptions);

  const [confirmReverse, setConfirmReverse] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  const gridLines = useMemo(
    () => (order ? salesOrderLinesToGrid(order.lines, products) : []),
    [order, products],
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-muted-foreground">{m.so_not_found()}</p>
      </div>
    );
  }

  const customer = customers.find((c) => c.id === order.customerId);
  const warehouse = warehouses.find((w) => w.id === order.warehouseId);
  const warehouseLabel = warehouse
    ? `${warehouse.code} ${warehouse.name}`
    : order.warehouseId;

  const breadcrumb = [
    { label: m.so_list_title(), to: "/sales/orders" },
    { label: order.docNumber ?? m.status_draft() },
  ];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["sales-order", id] });
  };

  // --- Draft: editable form (Simpan draf / Posting) --------------------------
  if (order.status === "draft") {
    const saveDraft = async (payload: SalesOrderPayload) => {
      setSaving(true);
      try {
        const { data } = await api.PUT("/sales-orders/{id}", {
          params: { path: { id } },
          body: {
            customerId: payload.customerId,
            warehouseId: payload.warehouseId,
            docDate: payload.docDate,
            notes: payload.notes || undefined,
            lines: payload.lines,
          },
        });
        if (!data) {
          toast.error(m.so_save_failed());
          return;
        }
        await invalidate();
        toast.success(m.so_saved());
      } finally {
        setSaving(false);
      }
    };

    const post = async (payload: SalesOrderPayload) => {
      setPosting(true);
      try {
        await api.PUT("/sales-orders/{id}", {
          params: { path: { id } },
          body: {
            customerId: payload.customerId,
            warehouseId: payload.warehouseId,
            docDate: payload.docDate,
            notes: payload.notes || undefined,
            lines: payload.lines,
          },
        });
        const { data: posted } = await api.POST("/sales-orders/{id}/post", {
          params: { path: { id } },
        });
        await invalidate();
        if (!posted) {
          toast.error(m.so_post_failed());
          return;
        }
        toast.success(m.so_posted({ number: posted.docNumber ?? "" }));
      } finally {
        setPosting(false);
      }
    };

    return (
      <RecordShell
        breadcrumb={breadcrumb}
        title={m.status_draft()}
        status="draft"
        actions={null}
        timeline={timeline(order)}
      >
        <SalesOrderDraftForm
          initial={{
            customerId: order.customerId,
            warehouseId: order.warehouseId,
            docDate: order.docDate,
            notes: order.notes ?? "",
            lines: gridLines,
          }}
          warehouses={warehouses}
          customers={customers}
          onSaveDraft={saveDraft}
          onPost={post}
          saving={saving}
          posting={posting}
        />
      </RecordShell>
    );
  }

  // --- Posted / reversed: read-only record with the fulfillment chain --------
  const reverse = async () => {
    setReversing(true);
    try {
      const { data } = await api.POST("/sales-orders/{id}/reverse", {
        params: { path: { id } },
      });
      await invalidate();
      if (data) {
        await queryClient.invalidateQueries({
          queryKey: ["sales-order", data.id],
        });
        toast.success(m.so_reversed({ number: data.docNumber ?? "" }));
        navigate({ to: "/sales/orders/$id", params: { id } });
      } else {
        toast.error(m.so_reverse_failed());
      }
    } finally {
      setReversing(false);
      setConfirmReverse(false);
    }
  };

  const isReversed = order.status === "reversed";
  const fulfillment = lineFulfillment(order, deliveries);
  const related = linkedDeliveries(order.id, deliveries);
  const totals = lineGridTotals(gridLines, { withCost: true });

  return (
    <RecordShell
      breadcrumb={breadcrumb}
      title={
        <span className="font-mono">{order.docNumber ?? m.status_draft()}</span>
      }
      status={order.status}
      banner={
        isReversed && order.reversedById ? (
          <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm">
            <Link
              to="/sales/orders/$id"
              params={{ id: order.reversedById }}
              className="underline underline-offset-4"
            >
              {m.so_reversed_by_link({ number: order.reversedById })}
            </Link>
          </div>
        ) : undefined
      }
      actions={
        isReversed ? null : (
          <>
            <Button
              onClick={() =>
                navigate({
                  to: "/sales/deliveries/new",
                  search: { salesOrderId: order.id },
                })
              }
            >
              {m.so_action_create_delivery()}
            </Button>
            <span className="text-xs text-muted-foreground">
              {m.so_print_hint()}
            </span>
            <Button variant="outline" disabled>
              {m.so_action_print()}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmReverse(true)}
            >
              {m.so_action_reverse()}
            </Button>
          </>
        )
      }
      timeline={timeline(order)}
    >
      <Card size="sm" className="px-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">
              {m.so_field_customer()}
            </dt>
            <dd>{customer?.name ?? order.customerId}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {m.so_field_warehouse()}
            </dt>
            <dd className="font-mono">{warehouseLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {m.so_field_date()}
            </dt>
            <dd className="tabular-nums">{formatDate(order.docDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {m.doclist_col_total()}
            </dt>
            <dd className="font-mono tabular-nums">
              {formatCurrency(salesOrderTotal(order.lines))}
            </dd>
          </div>
          {order.notes && (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-xs text-muted-foreground">
                {m.so_field_notes()}
              </dt>
              <dd>{order.notes}</dd>
            </div>
          )}
        </dl>
      </Card>

      {/* THE CHAIN: per-line ordered / delivered / remaining, joined
          client-side from posted deliveries (INC-4). */}
      <FulfillmentTable
        order={order}
        fulfillment={fulfillment}
        totals={totals}
      />

      <RelatedDeliveries related={related} />

      {!isReversed && (
        <p className="text-sm text-muted-foreground">
          {m.record_posted_notice()}
        </p>
      )}

      {isReversed && order.reversesId && (
        <p className="text-sm">
          <Link
            to="/sales/orders/$id"
            params={{ id: order.reversesId }}
            className="underline underline-offset-4"
          >
            {m.so_reverses_link({ number: order.reversesId })}
          </Link>
        </p>
      )}

      <ConfirmDialog
        open={confirmReverse}
        onOpenChange={setConfirmReverse}
        title={m.so_reverse_confirm_title()}
        specifics={m.so_reverse_confirm_specifics({
          number: order.docNumber ?? "",
          lines: order.lines.length,
          qty: formatNumber(totals.totalQty),
        })}
        confirmLabel={m.so_action_reverse()}
        destructive
        pending={reversing}
        onConfirm={reverse}
      />
    </RecordShell>
  );
}

function FulfillmentTable({
  order,
  fulfillment,
  totals,
}: {
  order: SalesOrder;
  fulfillment: LineFulfillment[];
  totals: { totalValue: number };
}) {
  const byLine = new Map(fulfillment.map((f) => [f.lineId, f]));
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{m.so_fulfillment_title()}</h2>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">
                {m.linegrid_col_product()}
              </th>
              <th className="w-28 px-3 py-2 text-right font-medium">
                {m.so_col_ordered()}
              </th>
              <th className="w-28 px-3 py-2 text-right font-medium">
                {m.so_col_delivered_qty()}
              </th>
              <th className="w-24 px-3 py-2 text-right font-medium">
                {m.so_col_remaining()}
              </th>
              <th className="w-32 px-3 py-2 text-right font-medium">
                {m.so_col_price()}
              </th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => {
              const f = byLine.get(line.id);
              return (
                <tr key={line.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">
                    {line.productId}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatNumber(f?.ordered ?? line.qty)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatNumber(f?.delivered ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatNumber(f?.remaining ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatCurrency(line.unitPrice)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/20">
              <td
                className="px-3 py-2 text-xs text-muted-foreground"
                colSpan={4}
              >
                {m.linegrid_totals_value()}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {formatCurrency(totals.totalValue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function RelatedDeliveries({ related }: { related: Delivery[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{m.so_related_title()}</h2>
      {related.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.so_related_empty()}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {related.map((d) => {
            const qty = d.lines.reduce((sum, l) => {
              const n = Number(l.qty);
              return sum + (Number.isNaN(n) ? 0 : n);
            }, 0);
            return (
              <li key={d.id}>
                <Link
                  to="/sales/deliveries/$id"
                  params={{ id: d.id }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <span className="font-mono">
                    {d.docNumber ?? m.status_draft()}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatDate(d.docDate)}
                  </span>
                  <span className="font-mono tabular-nums">
                    {m.so_related_qty({ qty: formatNumber(qty) })}
                  </span>
                  <span className="ml-auto">
                    <StatusBadge status={d.status} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
