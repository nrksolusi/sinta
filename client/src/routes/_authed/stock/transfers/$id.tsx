import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import {
  type GridLine,
  LineGrid,
  lineGridTotals,
} from "@/components/line-grid";
import { RecordShell } from "@/components/record-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { productsQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import { TransferForm, type TransferFormValue } from "./-transfer-form";
import {
  buildTransferTimeline,
  postConfirmSpecifics,
  type StockTransfer,
  toTransferInput,
  transferLinesToGrid,
} from "./-transfers-data";

export const Route = createFileRoute("/_authed/stock/transfers/$id")({
  component: TransferDetailPage,
});

function transferQueryOptions(id: string) {
  return {
    queryKey: ["stock-transfers", id] as const,
    queryFn: async (): Promise<StockTransfer | null> => {
      const { data } = await api.GET("/stock-transfers/{id}", {
        params: { path: { id } },
      });
      return data ?? null;
    },
  };
}

async function invalidateTransfer(id: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["stock-transfers"] }),
    queryClient.invalidateQueries({ queryKey: ["stock-transfers", id] }),
  ]);
}

function TransferDetailPage() {
  const { id } = Route.useParams();
  const { data: transfer, isLoading } = useQuery(transferQueryOptions(id));

  if (isLoading) {
    return (
      <div className="p-4 md:p-6" aria-busy="true">
        <div className="h-40 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          variant="first-use"
          title={m.transfer_not_found()}
          description=""
        />
      </div>
    );
  }

  if (transfer.status === "draft") {
    return <DraftDetail transfer={transfer} />;
  }
  return <PostedDetail transfer={transfer} />;
}

const breadcrumb = [
  {
    label: m.transfer_detail_breadcrumb_stock(),
    to: "/stock/transfers",
  },
  {
    label: m.transfer_detail_breadcrumb_transfers(),
    to: "/stock/transfers",
  },
];

const timelineLabels = {
  created: m.transfer_timeline_created(),
  posted: m.transfer_timeline_posted(),
  reversed: m.transfer_timeline_reversed(),
};

// Draft detail: the same editable form as /new, but persisting to an existing
// draft (PUT). Adds "Hapus draf" (destructive) to the action bar.
function DraftDetail({ transfer }: { transfer: StockTransfer }) {
  const { data: products = [] } = useQuery(productsQueryOptions);

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const [value, setValue] = useState<TransferFormValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  // Hydrate the form once products are available so lines resolve to products.
  const initial = useMemo<TransferFormValue>(
    () => ({
      fromWarehouseId: transfer.fromWarehouseId,
      toWarehouseId: transfer.toWarehouseId,
      docDate: transfer.docDate,
      notes: transfer.notes,
      lines: transferLinesToGrid(transfer.lines, productsById),
    }),
    [transfer, productsById],
  );
  const current = value ?? initial;

  async function saveDraft() {
    setSaving(true);
    try {
      const { data } = await api.PUT("/stock-transfers/{id}", {
        params: { path: { id: transfer.id } },
        body: toTransferInput(current),
      });
      if (!data) {
        toast.error(m.doc_create_failed());
        return;
      }
      await invalidateTransfer(transfer.id);
      toast.success(m.transfer_saved());
    } finally {
      setSaving(false);
    }
  }

  async function post() {
    setPosting(true);
    try {
      const { data: saved } = await api.PUT("/stock-transfers/{id}", {
        params: { path: { id: transfer.id } },
        body: toTransferInput(current),
      });
      if (!saved) {
        toast.error(m.doc_create_failed());
        return;
      }
      const { data: posted } = await api.POST("/stock-transfers/{id}/post", {
        params: { path: { id: transfer.id } },
      });
      if (!posted) {
        toast.error(m.doc_post_failed());
        return;
      }
      await invalidateTransfer(transfer.id);
      toast.success(m.doc_posted({ number: posted.docNumber ?? "" }));
    } finally {
      setPosting(false);
    }
  }

  return (
    <RecordShell
      breadcrumb={breadcrumb}
      title={m.status_draft()}
      status="draft"
      actions={null}
      timeline={buildTransferTimeline(transfer, timelineLabels)}
    >
      {/* "Hapus draf" is omitted deliberately: the server contract has no
          delete-draft endpoint for any document type (see api-types.ts). No
          dead control per UX-D10; the action returns once the API adds it. */}
      <TransferForm
        value={current}
        onChange={setValue}
        onSaveDraft={saveDraft}
        onPost={post}
        saving={saving}
        posting={posting}
      />
    </RecordShell>
  );
}

// Posted / reversed detail: read-only LineGrid, cannot-change notice, and the
// legal transition ("Batalkan" while posted). Reversed shows a banner and the
// reversal cross-links, no actions (UX-D7).
function PostedDetail({ transfer }: { transfer: StockTransfer }) {
  const { data: products = [] } = useQuery(productsQueryOptions);
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const [confirmReverse, setConfirmReverse] = useState(false);
  const [reversing, setReversing] = useState(false);

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const warehouseName = (wid: string) =>
    warehouses.find((w) => w.id === wid)?.code ?? wid;

  const lines: GridLine[] = useMemo(
    () => transferLinesToGrid(transfer.lines, productsById),
    [transfer.lines, productsById],
  );
  const totals = lineGridTotals(lines, { withCost: false });

  const isReversed = transfer.status === "reversed";

  async function reverse() {
    setReversing(true);
    try {
      const { data } = await api.POST("/stock-transfers/{id}/reverse", {
        params: { path: { id: transfer.id } },
      });
      if (!data) {
        toast.error(m.error_generic());
        return;
      }
      await invalidateTransfer(transfer.id);
      toast.success(
        m.transfer_reversed_toast({ number: transfer.docNumber ?? "" }),
      );
    } finally {
      setReversing(false);
    }
  }

  const title = (
    <span className="font-mono tabular-nums">{transfer.docNumber ?? "-"}</span>
  );

  const reverseSpecifics = (() => {
    const data = postConfirmSpecifics({
      lines,
      fromName: warehouseName(transfer.fromWarehouseId),
      toName: warehouseName(transfer.toWarehouseId),
    });
    return m.transfer_reverse_confirm_specifics({
      number: transfer.docNumber ?? "",
      lines: data.lineCount,
      qty: formatNumber(data.totalQty),
      from: data.fromName,
      to: data.toName,
    });
  })();

  return (
    <RecordShell
      breadcrumb={breadcrumb}
      title={title}
      status={transfer.status}
      banner={
        isReversed && transfer.reversedById ? (
          <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
            <ReversalLink
              id={transfer.reversedById}
              label={(number) => m.transfer_reversed_by_link({ number })}
            />
          </div>
        ) : undefined
      }
      actions={
        transfer.status === "posted" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmReverse(true)}
          >
            {m.transfer_action_reverse()}
          </Button>
        ) : null
      }
      timeline={buildTransferTimeline(transfer, timelineLabels)}
    >
      <Card size="sm">
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">
              {m.transfer_field_from_warehouse()}
            </div>
            <div className="font-mono">
              {warehouseName(transfer.fromWarehouseId)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {m.transfer_field_to_warehouse()}
            </div>
            <div className="font-mono">
              {warehouseName(transfer.toWarehouseId)}
            </div>
          </div>
          {transfer.notes && (
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">
                {m.field_notes()}
              </div>
              <div>{transfer.notes}</div>
            </div>
          )}
          {transfer.reversesId && (
            <div className="sm:col-span-2">
              <ReversalLink
                id={transfer.reversesId}
                label={(number) => m.transfer_reverses_link({ number })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{m.transfer_section_lines()}</h2>
        <LineGrid
          lines={lines}
          onChange={() => {}}
          withCost={false}
          qtyLabel={m.transfer_field_qty_label()}
          readOnly
          totals={totals}
        />
      </section>

      {/* Passive cannot-change notice (UX-D7): edit affordances are removed,
          not disabled. */}
      <p className="text-xs text-muted-foreground">
        {m.transfer_posted_notice()}
      </p>

      <ConfirmDialog
        open={confirmReverse}
        onOpenChange={setConfirmReverse}
        destructive
        pending={reversing}
        title={m.transfer_reverse_confirm_title()}
        specifics={reverseSpecifics}
        confirmLabel={m.transfer_action_reverse()}
        onConfirm={reverse}
      />
    </RecordShell>
  );
}

// Cross-link to the paired reversal document (UX-D7: links render both ways).
// Fetches the linked transfer for its doc number; falls back to the id while
// loading so the link is never blank.
function ReversalLink({
  id,
  label,
}: {
  id: string;
  label: (number: string) => string;
}) {
  const { data } = useQuery(transferQueryOptions(id));
  const number = data?.docNumber ?? id;
  return (
    <Link
      to="/stock/transfers/$id"
      params={{ id }}
      className="text-sm underline underline-offset-4"
    >
      {label(number)}
    </Link>
  );
}
