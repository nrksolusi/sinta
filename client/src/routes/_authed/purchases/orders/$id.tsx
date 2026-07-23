import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { type GridLine, lineGridTotals } from "@/components/line-grid";
import { RecordShell, type TimelineEntry } from "@/components/record-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import {
  pickerPartnersQueryOptions,
  pickerProductsQueryOptions,
  pickerWarehousesQueryOptions,
} from "@/lib/pickers-data";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import {
  draftToPayload,
  type FulfillmentRow,
  fulfillmentRows,
  gridLineFromPoLine,
  linkedReceipts,
  type OrderDraft,
} from "./-order-data";
import { OrderDraftEditor } from "./-order-editor";

type GoodsReceipt = components["schemas"]["GoodsReceipt"];
type PurchaseOrder = components["schemas"]["PurchaseOrder"];
type Product = components["schemas"]["Product"];

export const Route = createFileRoute("/_authed/purchases/orders/$id")({
  component: OrderDetailPage,
});

function orderQueryOptions(id: string) {
  return {
    queryKey: ["purchase-order", id],
    queryFn: async (): Promise<PurchaseOrder | null> => {
      const { data } = await api.GET("/purchase-orders/{id}", {
        params: { path: { id } },
      });
      return data ?? null;
    },
  };
}

function OrderDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const { data: order, isPending } = useQuery(orderQueryOptions(id));
  const { data: products = [] } = useQuery(pickerProductsQueryOptions);
  const { data: suppliers = [] } = useQuery(
    pickerPartnersQueryOptions("supplier"),
  );
  const { data: warehouses = [] } = useQuery(pickerWarehousesQueryOptions);
  // Linked receipts drive the client-side fulfillment join on a posted PO.
  const { data: receipts = [] } = useQuery({
    queryKey: ["goods-receipts"],
    queryFn: async () => {
      const { data } = await api.GET("/goods-receipts");
      return data?.items ?? [];
    },
  });

  const productById = useMemo(() => {
    const byId = new Map<string, Product>(products.map((p) => [p.id, p]));
    return (pid: string) => byId.get(pid);
  }, [products]);
  const warehouseName = useMemo(() => {
    const byId = new Map(warehouses.map((w) => [w.id, w.name]));
    return (wid: string) => byId.get(wid) ?? wid;
  }, [warehouses]);
  const supplierName = useMemo(() => {
    const byId = new Map(suppliers.map((s) => [s.id, s.name]));
    return (sid: string) => byId.get(sid) ?? sid;
  }, [suppliers]);

  if (isPending) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4 md:p-6">
        <div className="h-40 animate-pulse rounded-md bg-muted" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4 md:p-6">
        <p className="text-sm text-muted-foreground">{m.po_not_found()}</p>
      </main>
    );
  }

  const breadcrumb = [
    { label: m.po_breadcrumb_purchases() },
    { label: m.po_breadcrumb_orders(), to: "/purchases/orders" },
    { label: order.docNumber ?? m.status_draft() },
  ];

  const title = order.docNumber ? (
    <span className="font-mono tabular-nums">{order.docNumber}</span>
  ) : (
    m.status_draft()
  );

  const timeline = buildTimeline(order);

  if (order.status === "draft") {
    return (
      <DraftDetail
        order={order}
        breadcrumb={breadcrumb}
        title={title}
        timeline={timeline}
        productById={productById}
        supplierName={supplierName}
        onDone={() => navigate({ to: "/purchases/orders/$id", params: { id } })}
      />
    );
  }

  return (
    <PostedDetail
      order={order}
      receipts={receipts}
      breadcrumb={breadcrumb}
      title={title}
      timeline={timeline}
      productById={productById}
      supplierName={supplierName}
      warehouseName={warehouseName}
    />
  );
}

// Timeline entries derived from the PO metadata. The get shape carries only
// docDate and status, so this renders one entry per reached state, dated by
// docDate, with no actor at M1 (mirrors the receipt lifecycle).
function buildTimeline(order: PurchaseOrder): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { action: m.po_timeline_created(), actor: "", at: order.docDate },
  ];
  if (order.status === "posted" || order.status === "reversed") {
    entries.push({
      action: m.po_timeline_posted(),
      actor: "",
      at: order.docDate,
    });
  }
  if (order.status === "reversed") {
    entries.push({
      action: m.po_timeline_reversed(),
      actor: "",
      at: order.docDate,
    });
  }
  return entries;
}

// ---- draft (editable) --------------------------------------------------------

function DraftDetail({
  order,
  breadcrumb,
  title,
  timeline,
  productById,
  supplierName,
  onDone,
}: {
  order: PurchaseOrder;
  breadcrumb: { label: React.ReactNode; to?: string }[];
  title: React.ReactNode;
  timeline: TimelineEntry[];
  productById: (id: string) => Product | undefined;
  supplierName: (id: string) => string;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);

  // Hydrate the editable draft from the saved PO once products resolve.
  useEffect(() => {
    if (draft) return;
    const lines = order.lines
      .map((line) => gridLineFromPoLine(line, productById))
      .filter((l): l is GridLine => l !== null);
    setDraft({
      supplierId: order.supplierId,
      warehouseId: order.warehouseId,
      docDate: order.docDate,
      notes: order.notes,
      lines,
    });
  }, [draft, order, productById]);

  if (!draft) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4 md:p-6">
        <div className="h-40 animate-pulse rounded-md bg-muted" />
      </main>
    );
  }

  async function save(): Promise<boolean> {
    if (!draft) return false;
    setSaving(true);
    try {
      const { data } = await api.PUT("/purchase-orders/{id}", {
        params: { path: { id: order.id } },
        body: draftToPayload(draft),
      });
      if (!data) {
        toast.error(m.po_save_failed());
        return false;
      }
      await queryClient.invalidateQueries({
        queryKey: ["purchase-order", order.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function onSaveDraft() {
    if (await save()) {
      toast.success(m.po_draft_saved());
      onDone();
    }
  }

  async function onPost() {
    setPosting(true);
    try {
      if (!(await save())) return;
      const { data } = await api.POST("/purchase-orders/{id}/post", {
        params: { path: { id: order.id } },
      });
      if (!data) {
        toast.error(m.doc_post_failed());
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["purchase-order", order.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setPostConfirmOpen(false);
    } finally {
      setPosting(false);
    }
  }

  return (
    <RecordShell
      breadcrumb={breadcrumb}
      title={title}
      status="draft"
      actions={null}
      timeline={timeline}
    >
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
    </RecordShell>
  );
}

// ---- posted / reversed (read-only + chain) -----------------------------------

function PostedDetail({
  order,
  receipts,
  breadcrumb,
  title,
  timeline,
  productById,
  supplierName,
  warehouseName,
}: {
  order: PurchaseOrder;
  receipts: GoodsReceipt[];
  breadcrumb: { label: React.ReactNode; to?: string }[];
  title: React.ReactNode;
  timeline: TimelineEntry[];
  productById: (id: string) => Product | undefined;
  supplierName: (id: string) => string;
  warehouseName: (id: string) => string;
}) {
  const [reverseConfirmOpen, setReverseConfirmOpen] = useState(false);
  const [reversing, setReversing] = useState(false);

  const rows = useMemo<FulfillmentRow[]>(
    () => fulfillmentRows(order, receipts, productById),
    [order, receipts, productById],
  );
  const related = useMemo(
    () => linkedReceipts(order.id, receipts),
    [order.id, receipts],
  );
  // Totals for the reverse confirm dialog, computed from the ordered lines.
  const totals = useMemo(() => {
    const gridLines: GridLine[] = order.lines
      .map((line) => gridLineFromPoLine(line, productById))
      .filter((l): l is GridLine => l !== null);
    return lineGridTotals(gridLines, { withCost: true });
  }, [order.lines, productById]);
  const reversed = order.status === "reversed";

  async function onReverse() {
    setReversing(true);
    try {
      const { data } = await api.POST("/purchase-orders/{id}/reverse", {
        params: { path: { id: order.id } },
      });
      if (!data) {
        toast.error(m.po_reverse_failed());
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["purchase-order", order.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setReverseConfirmOpen(false);
    } finally {
      setReversing(false);
    }
  }

  const actions = reversed ? null : (
    <>
      {/* Skip the chain forward: pre-fill a receipt from this PO (UX-D4). The
          receipt /new route implements the ?purchaseOrderId prefill contract. */}
      <Button
        render={
          <Link
            to="/purchases/receipts/new"
            search={{ purchaseOrderId: order.id }}
          />
        }
      >
        {m.po_action_create_receipt()}
      </Button>
      <Button
        variant="ghost"
        className="text-destructive"
        disabled={reversing}
        onClick={() => setReverseConfirmOpen(true)}
      >
        {m.po_action_reverse()}
      </Button>
    </>
  );

  // Reversal cross-links in both directions (UX-D7 / design flow 4).
  const banner = reversed ? (
    order.reversedById ? (
      <ReversalLink message={m.po_reversed_banner} toId={order.reversedById} />
    ) : null
  ) : order.reversesId ? (
    <ReversalLink message={m.po_reverses_banner} toId={order.reversesId} />
  ) : undefined;

  return (
    <RecordShell
      breadcrumb={breadcrumb}
      title={title}
      status={order.status}
      actions={actions}
      banner={banner}
      timeline={timeline}
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Field
          label={m.po_field_supplier()}
          value={supplierName(order.supplierId)}
        />
        <Field
          label={m.po_field_warehouse()}
          value={warehouseName(order.warehouseId)}
        />
      </div>

      <FulfillmentTable rows={rows} />

      {!reversed && (
        <p className="text-sm text-muted-foreground">{m.po_posted_notice()}</p>
      )}

      <RelatedReceipts receipts={related} />

      {!reversed && (
        <ConfirmDialog
          open={reverseConfirmOpen}
          onOpenChange={setReverseConfirmOpen}
          title={m.po_reverse_confirm_title()}
          specifics={m.po_reverse_confirm_specifics({
            number: order.docNumber ?? order.id,
            count: totals.lines,
            qty: formatNumber(totals.totalQty),
          })}
          confirmLabel={m.po_action_reverse()}
          onConfirm={onReverse}
          destructive
          pending={reversing}
        />
      )}
    </RecordShell>
  );
}

// The chain: per-line ordered / received / remaining (prototype D4). Received
// and remaining are client-side joins over linked posted receipts (INC-4).
function FulfillmentTable({ rows }: { rows: FulfillmentRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{m.po_chain_title()}</h2>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                {m.po_chain_col_product()}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {m.po_chain_col_ordered()}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {m.po_chain_col_received()}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {m.po_chain_col_remaining()}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {m.po_chain_col_cost()}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.poLineId} className="border-t">
                <td className="px-3 py-2">
                  <div>{row.productName}</div>
                  {row.productCode && (
                    <div className="font-mono text-xs text-muted-foreground">
                      {row.productCode}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatNumber(row.ordered)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatNumber(row.received)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  <span
                    className={
                      row.remaining === 0 ? "text-muted-foreground" : undefined
                    }
                  >
                    {formatNumber(row.remaining)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatCurrency(row.unitCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Receipts linked to this PO, each a link into the receipt detail (UX-D4).
function RelatedReceipts({ receipts }: { receipts: GoodsReceipt[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{m.po_related_title()}</h2>
      {receipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.po_related_empty()}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {receipts.map((gr) => {
            const qty = gr.lines.reduce((sum, l) => sum + Number(l.qty), 0);
            return (
              <li key={gr.id}>
                <Link
                  to="/purchases/receipts/$id"
                  params={{ id: gr.id }}
                  className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <span className="font-mono tabular-nums">
                    {gr.docNumber ?? m.status_draft()}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(gr.docDate)}
                  </span>
                  <span className="font-mono tabular-nums">
                    {m.po_related_qty({ qty: formatNumber(qty) })}
                  </span>
                  <span className="ml-auto">
                    <StatusBadge status={gr.status} />
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

function ReversalLink({
  message,
  toId,
}: {
  message: (params: { number: string }) => string;
  toId: string;
}) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <Link
        to="/purchases/orders/$id"
        params={{ id: toId }}
        className="underline underline-offset-4"
      >
        {message({ number: toId })}
      </Link>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
