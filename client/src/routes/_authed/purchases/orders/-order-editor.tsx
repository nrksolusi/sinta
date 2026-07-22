import { ConfirmDialog } from "@/components/confirm-dialog";
import { lineGridTotals } from "@/components/line-grid";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages";
import type { OrderDraft } from "./-order-data";
import { OrderForm } from "./-order-form";

// Why posting is blocked, as a visible caption (never a bare disabled button -
// design principle A3 / accessibility checklist E). Returns null when postable.
export function postBlockReason(draft: OrderDraft): string | null {
  if (!draft.supplierId) return m.po_reason_no_supplier();
  if (!draft.warehouseId) return m.po_reason_no_warehouse();
  if (draft.lines.length === 0) return m.po_reason_no_lines();
  return null;
}

export interface OrderDraftEditorProps {
  draft: OrderDraft;
  onChange: (draft: OrderDraft) => void;
  // Action handlers owned by the route (they touch the server + navigation).
  onSaveDraft: () => void;
  onPost: () => void;
  saving: boolean;
  posting: boolean;
  postConfirmOpen: boolean;
  onPostConfirmOpenChange: (open: boolean) => void;
  // Resolves the chosen supplier to its display name for the confirm dialog.
  supplierName: (supplierId: string) => string;
}

// The draft editing surface shared by /new and /$id (draft): the form plus the
// action bar (Save draft / Post) and the post confirm dialog.
export function OrderDraftEditor({
  draft,
  onChange,
  onSaveDraft,
  onPost,
  saving,
  posting,
  postConfirmOpen,
  onPostConfirmOpenChange,
  supplierName,
}: OrderDraftEditorProps) {
  const blockReason = postBlockReason(draft);
  const totals = lineGridTotals(draft.lines, { withCost: true });

  return (
    <div className="flex flex-col gap-5">
      <OrderForm draft={draft} onChange={onChange} />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={saving} onClick={onSaveDraft}>
          {m.po_action_save_draft()}
        </Button>

        <div className="flex items-center gap-2">
          <Button
            disabled={blockReason !== null || posting}
            onClick={() => onPostConfirmOpenChange(true)}
          >
            {m.po_action_post()}
          </Button>
          {blockReason && (
            <span className="text-xs text-muted-foreground">{blockReason}</span>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={postConfirmOpen}
        onOpenChange={onPostConfirmOpenChange}
        title={m.po_post_confirm_title()}
        specifics={m.po_post_confirm_specifics({
          count: totals.lines,
          qty: formatNumber(totals.totalQty),
          supplier: supplierName(draft.supplierId),
        })}
        confirmLabel={m.po_action_post()}
        onConfirm={onPost}
        pending={posting}
      />
    </div>
  );
}
