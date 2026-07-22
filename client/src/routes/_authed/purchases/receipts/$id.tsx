import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LineGrid, lineGridTotals } from "@/components/line-grid";
import { RecordShell, type TimelineEntry } from "@/components/record-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { formatNumber } from "@/lib/format";
import {
  pickerPartnersQueryOptions,
  pickerProductsQueryOptions,
  pickerWarehousesQueryOptions,
} from "@/lib/pickers-data";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import {
  draftToPayload,
  gridLineFromReceiptLine,
  type ReceiptDraft,
  type ReceiptGridLine,
} from "./-receipt-data";
import { ReceiptDraftEditor } from "./-receipt-editor";

type GoodsReceipt = components["schemas"]["GoodsReceipt"];
type Product = components["schemas"]["Product"];

export const Route = createFileRoute("/_authed/purchases/receipts/$id")({
  component: ReceiptDetailPage,
});

function receiptQueryOptions(id: string) {
  return {
    queryKey: ["goods-receipt", id],
    queryFn: async (): Promise<GoodsReceipt | null> => {
      const { data } = await api.GET("/goods-receipts/{id}", {
        params: { path: { id } },
      });
      return data ?? null;
    },
  };
}

function ReceiptDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const { data: receipt, isPending } = useQuery(receiptQueryOptions(id));
  const { data: products = [] } = useQuery(pickerProductsQueryOptions);
  const { data: suppliers = [] } = useQuery(
    pickerPartnersQueryOptions("supplier"),
  );
  const { data: warehouses = [] } = useQuery(pickerWarehousesQueryOptions);

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

  if (!receipt) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4 md:p-6">
        <p className="text-sm text-muted-foreground">{m.receipt_not_found()}</p>
      </main>
    );
  }

  const breadcrumb = [
    { label: m.receipt_breadcrumb_purchases() },
    {
      label: m.receipt_breadcrumb_receipts(),
      to: "/purchases/receipts",
    },
    { label: receipt.docNumber ?? m.status_draft() },
  ];

  const title = receipt.docNumber ? (
    <span className="font-mono tabular-nums">{receipt.docNumber}</span>
  ) : (
    m.status_draft()
  );

  const timeline = buildTimeline(receipt);

  if (receipt.status === "draft") {
    return (
      <DraftDetail
        receipt={receipt}
        breadcrumb={breadcrumb}
        title={title}
        timeline={timeline}
        productById={productById}
        warehouseName={warehouseName}
        onDone={() =>
          navigate({ to: "/purchases/receipts/$id", params: { id } })
        }
      />
    );
  }

  return (
    <PostedDetail
      receipt={receipt}
      breadcrumb={breadcrumb}
      title={title}
      timeline={timeline}
      productById={productById}
      supplierName={supplierName}
      warehouseName={warehouseName}
    />
  );
}

// Timeline entries derived from the receipt metadata. The list/get shape carries
// only docDate and status (no created/posted timestamps or actor yet), so this
// renders one entry per reached state, dated by docDate, with no actor at M1.
function buildTimeline(receipt: GoodsReceipt): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { action: m.receipt_timeline_created(), actor: "", at: receipt.docDate },
  ];
  if (receipt.status === "posted" || receipt.status === "reversed") {
    entries.push({
      action: m.receipt_timeline_posted(),
      actor: "",
      at: receipt.docDate,
    });
  }
  if (receipt.status === "reversed") {
    entries.push({
      action: m.receipt_timeline_reversed(),
      actor: "",
      at: receipt.docDate,
    });
  }
  return entries;
}

// ---- draft (editable) --------------------------------------------------------

function DraftDetail({
  receipt,
  breadcrumb,
  title,
  timeline,
  productById,
  warehouseName,
  onDone,
}: {
  receipt: GoodsReceipt;
  breadcrumb: { label: React.ReactNode; to?: string }[];
  title: React.ReactNode;
  timeline: TimelineEntry[];
  productById: (id: string) => Product | undefined;
  warehouseName: (id: string) => string;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);

  // Hydrate the editable draft from the saved receipt once products resolve.
  useEffect(() => {
    if (draft) return;
    const lines = receipt.lines
      .map((line) => gridLineFromReceiptLine(line, productById))
      .filter((l): l is ReceiptGridLine => l !== null);
    setDraft({
      supplierId: receipt.supplierId,
      warehouseId: receipt.warehouseId,
      docDate: receipt.docDate,
      notes: receipt.notes,
      purchaseOrderId: receipt.purchaseOrderId ?? null,
      lines,
    });
  }, [draft, receipt, productById]);

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
      const { data } = await api.PUT("/goods-receipts/{id}", {
        params: { path: { id: receipt.id } },
        body: draftToPayload(draft),
      });
      if (!data) {
        toast.error(m.receipt_save_failed());
        return false;
      }
      await queryClient.invalidateQueries({
        queryKey: ["goods-receipt", receipt.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function onSaveDraft() {
    if (await save()) {
      toast.success(m.receipt_draft_saved());
      onDone();
    }
  }

  async function onPost() {
    setPosting(true);
    try {
      if (!(await save())) return;
      const { data } = await api.POST("/goods-receipts/{id}/post", {
        params: { path: { id: receipt.id } },
      });
      if (!data) {
        toast.error(m.doc_post_failed());
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["goods-receipt", receipt.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
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
      <ReceiptDraftEditor
        draft={draft}
        onChange={setDraft}
        onSaveDraft={onSaveDraft}
        onPost={onPost}
        saving={saving}
        posting={posting}
        postConfirmOpen={postConfirmOpen}
        onPostConfirmOpenChange={setPostConfirmOpen}
        warehouseName={warehouseName}
      />
    </RecordShell>
  );
}

// ---- posted / reversed (read-only) -------------------------------------------

function PostedDetail({
  receipt,
  breadcrumb,
  title,
  timeline,
  productById,
  supplierName,
  warehouseName,
}: {
  receipt: GoodsReceipt;
  breadcrumb: { label: React.ReactNode; to?: string }[];
  title: React.ReactNode;
  timeline: TimelineEntry[];
  productById: (id: string) => Product | undefined;
  supplierName: (id: string) => string;
  warehouseName: (id: string) => string;
}) {
  const [reverseConfirmOpen, setReverseConfirmOpen] = useState(false);
  const [reversing, setReversing] = useState(false);

  const lines = useMemo<ReceiptGridLine[]>(
    () =>
      receipt.lines
        .map((line) => gridLineFromReceiptLine(line, productById))
        .filter((l): l is ReceiptGridLine => l !== null),
    [receipt.lines, productById],
  );
  const totals = lineGridTotals(lines, { withCost: true });
  const reversed = receipt.status === "reversed";

  async function onReverse() {
    setReversing(true);
    try {
      const { data } = await api.POST("/goods-receipts/{id}/reverse", {
        params: { path: { id: receipt.id } },
      });
      if (!data) {
        toast.error(m.receipt_reverse_failed());
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["goods-receipt", receipt.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      setReverseConfirmOpen(false);
    } finally {
      setReversing(false);
    }
  }

  const actions = reversed ? null : (
    <>
      <Button variant="outline" disabled title={m.receipt_soon_hint()}>
        {m.receipt_action_print()}
      </Button>
      <Button variant="outline" disabled title={m.receipt_soon_hint()}>
        {m.receipt_action_make_invoice()}
      </Button>
      <Button
        variant="ghost"
        className="text-destructive"
        disabled={reversing}
        onClick={() => setReverseConfirmOpen(true)}
      >
        {m.receipt_action_reverse()}
      </Button>
    </>
  );

  // Reversal cross-links in both directions (UX-D7 / design flow 4).
  const banner = reversed ? (
    receipt.reversedById ? (
      <ReversalLink
        message={m.receipt_reversed_banner}
        toId={receipt.reversedById}
      />
    ) : null
  ) : receipt.reversesId ? (
    <ReversalLink
      message={m.receipt_reverses_banner}
      toId={receipt.reversesId}
    />
  ) : undefined;

  return (
    <RecordShell
      breadcrumb={breadcrumb}
      title={title}
      status={receipt.status}
      actions={actions}
      banner={banner}
      timeline={timeline}
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Field
          label={m.receipt_field_supplier()}
          value={supplierName(receipt.supplierId)}
        />
        <Field
          label={m.receipt_field_warehouse()}
          value={warehouseName(receipt.warehouseId)}
        />
      </div>

      {/* Frozen grid: same component, readOnly. */}
      <LineGrid
        lines={lines}
        onChange={() => {}}
        withCost
        qtyLabel={m.receipt_qty_label()}
        readOnly
        totals={totals}
      />

      {!reversed && (
        <p className="text-sm text-muted-foreground">
          {m.receipt_posted_notice()}
        </p>
      )}

      {!reversed && (
        <ConfirmDialog
          open={reverseConfirmOpen}
          onOpenChange={setReverseConfirmOpen}
          title={m.receipt_reverse_confirm_title()}
          specifics={m.receipt_reverse_confirm_specifics({
            number: receipt.docNumber ?? receipt.id,
            count: totals.lines,
            qty: formatNumber(totals.totalQty),
          })}
          confirmLabel={m.receipt_action_reverse()}
          onConfirm={onReverse}
          destructive
          pending={reversing}
        />
      )}
    </RecordShell>
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
        to="/purchases/receipts/$id"
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
