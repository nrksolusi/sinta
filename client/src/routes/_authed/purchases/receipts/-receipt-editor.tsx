import { ConfirmDialog } from "@/components/confirm-dialog";
import { lineGridTotals } from "@/components/line-grid";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages";
import type { ReceiptDraft } from "./-receipt-data";
import { ReceiptForm } from "./-receipt-form";

// Why posting is blocked, as a visible caption (never a bare disabled button -
// design principle A3 / accessibility checklist E). Returns null when the draft
// is postable.
export function postBlockReason(draft: ReceiptDraft): string | null {
  if (!draft.supplierId) return m.receipt_reason_no_supplier();
  if (!draft.warehouseId) return m.receipt_reason_no_warehouse();
  if (draft.lines.length === 0) return m.receipt_reason_no_lines();
  return null;
}

export interface ReceiptDraftEditorProps {
  draft: ReceiptDraft;
  onChange: (draft: ReceiptDraft) => void;
  poNotice?: React.ReactNode;
  // Action handlers owned by the route (they touch the server + navigation).
  onSaveDraft: () => void;
  onPost: () => void;
  saving: boolean;
  posting: boolean;
  postConfirmOpen: boolean;
  onPostConfirmOpenChange: (open: boolean) => void;
  // Delete-draft is only offered on a persisted draft (/$id), not on /new.
  onDelete?: () => void;
  deleteConfirmOpen?: boolean;
  onDeleteConfirmOpenChange?: (open: boolean) => void;
  deleting?: boolean;
  // Resolves the chosen warehouse to its display name for the confirm dialog.
  warehouseName: (warehouseId: string) => string;
}

// The draft editing surface shared by /new and /$id (draft): the form plus the
// action bar (Save draft / Post [+ optional Delete]) and their confirm dialogs.
export function ReceiptDraftEditor({
  draft,
  onChange,
  poNotice,
  onSaveDraft,
  onPost,
  saving,
  posting,
  postConfirmOpen,
  onPostConfirmOpenChange,
  onDelete,
  deleteConfirmOpen = false,
  onDeleteConfirmOpenChange,
  deleting = false,
  warehouseName,
}: ReceiptDraftEditorProps) {
  const blockReason = postBlockReason(draft);
  const totals = lineGridTotals(draft.lines, { withCost: true });

  return (
    <div className="flex flex-col gap-5">
      <ReceiptForm draft={draft} onChange={onChange} poNotice={poNotice} />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={saving} onClick={onSaveDraft}>
          {m.receipt_action_save_draft()}
        </Button>

        <div className="flex items-center gap-2">
          <Button
            disabled={blockReason !== null || posting}
            onClick={() => onPostConfirmOpenChange(true)}
          >
            {m.receipt_action_post()}
          </Button>
          {blockReason && (
            <span className="text-xs text-muted-foreground">{blockReason}</span>
          )}
        </div>

        {onDelete && (
          <Button
            variant="ghost"
            className="ml-auto text-destructive"
            disabled={deleting}
            onClick={() => onDeleteConfirmOpenChange?.(true)}
          >
            {m.receipt_action_delete_draft()}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={postConfirmOpen}
        onOpenChange={onPostConfirmOpenChange}
        title={m.receipt_post_confirm_title()}
        specifics={m.receipt_post_confirm_specifics({
          count: totals.lines,
          qty: formatNumber(totals.totalQty),
          warehouse: warehouseName(draft.warehouseId),
        })}
        confirmLabel={m.receipt_action_post()}
        onConfirm={onPost}
        pending={posting}
      />

      {onDelete && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={(open) => onDeleteConfirmOpenChange?.(open)}
          title={m.receipt_delete_confirm_title()}
          specifics={m.receipt_delete_confirm_specifics({
            count: draft.lines.length,
          })}
          confirmLabel={m.receipt_action_delete_draft()}
          onConfirm={onDelete}
          destructive
          pending={deleting}
        />
      )}
    </div>
  );
}
