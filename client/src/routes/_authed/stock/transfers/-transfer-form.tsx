import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  type GridLine,
  LineGrid,
  lineGridTotals,
} from "@/components/line-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WarehouseCombobox } from "@/components/warehouse-combobox";
import { warehousesQueryOptions } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages";
import {
  postConfirmSpecifics,
  sameWarehouse,
  transferTotalQty,
} from "./-transfers-data";

// The editable transfer surface, shared by /new (unsaved) and /$id (draft). It
// owns local form state and the same-warehouse rule; the parent supplies the
// persistence callbacks and any delete affordance.
export interface TransferFormValue {
  fromWarehouseId: string;
  toWarehouseId: string;
  docDate: string;
  notes: string;
  lines: GridLine[];
}

export interface TransferFormProps {
  value: TransferFormValue;
  onChange: (value: TransferFormValue) => void;
  // Persist the current form as a draft (create or update). Returns when done.
  onSaveDraft: () => Promise<void>;
  // Save + post, landing on the posted detail. Called only when postable.
  onPost: () => Promise<void>;
  // Extra action (e.g. "Hapus draf") rendered in the action bar.
  extraActions?: ReactNode;
  saving?: boolean;
  posting?: boolean;
}

export function TransferForm({
  value,
  onChange,
  onSaveDraft,
  onPost,
  extraActions,
  saving = false,
  posting = false,
}: TransferFormProps) {
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const [confirmPost, setConfirmPost] = useState(false);

  const patch = (over: Partial<TransferFormValue>) =>
    onChange({ ...value, ...over });

  const isSameWarehouse = sameWarehouse(
    value.fromWarehouseId,
    value.toWarehouseId,
  );
  const hasLines = value.lines.length > 0;
  const validQty = value.lines.every((l) => Number(l.qty) > 0);

  // The single reason shown under the Posting button when it is unavailable
  // (UX-D10: never a bare disabled button).
  const postReason: string | null = !value.fromWarehouseId
    ? m.transfer_reason_pick_from()
    : !value.toWarehouseId
      ? m.transfer_reason_pick_to()
      : isSameWarehouse
        ? m.transfer_reason_same_warehouse()
        : !hasLines || !validQty
          ? m.transfer_reason_add_line()
          : null;
  const canPost = postReason === null && !posting && !saving;
  const canSave = !saving && !posting;

  const warehouseName = (id: string) =>
    warehouses.find((w) => w.id === id)?.code ?? id;

  const totals = lineGridTotals(value.lines, { withCost: false });

  return (
    <>
      <Card size="sm">
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label id="transfer-from-label">
              {m.transfer_field_from_warehouse()}
            </Label>
            <WarehouseCombobox
              value={value.fromWarehouseId || undefined}
              onSelect={(w) => patch({ fromWarehouseId: w.id })}
            />
          </div>

          <div className="space-y-1">
            <Label id="transfer-to-label">
              {m.transfer_field_to_warehouse()}
            </Label>
            <WarehouseCombobox
              value={value.toWarehouseId || undefined}
              onSelect={(w) => patch({ toWarehouseId: w.id })}
            />
            {isSameWarehouse && (
              <p
                role="alert"
                className="text-xs text-destructive"
                data-testid="transfer-same-warehouse-error"
              >
                {m.transfer_same_warehouse_error()}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="transfer-doc-date">{m.field_doc_date()}</Label>
            <Input
              id="transfer-doc-date"
              type="date"
              value={value.docDate}
              onChange={(e) => patch({ docDate: e.target.value })}
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="transfer-notes">{m.field_notes()}</Label>
            <Textarea
              id="transfer-notes"
              rows={2}
              value={value.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{m.transfer_section_lines()}</h2>
        {/* The shared LineGrid owns its ProductCombobox and does not thread a
            warehouseId, so stock-on-hand for the Dari gudang is not shown per
            row yet; wiring that is a LineGrid change tracked separately. */}
        <LineGrid
          lines={value.lines}
          onChange={(lines) => patch({ lines })}
          withCost={false}
          qtyLabel={m.transfer_field_qty_label()}
          readOnly={false}
          totals={totals}
        />
      </section>

      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {extraActions}
          <Button
            variant="outline"
            disabled={!canSave}
            onClick={() => onSaveDraft()}
          >
            {m.transfer_action_save_draft()}
          </Button>
          <Button disabled={!canPost} onClick={() => setConfirmPost(true)}>
            {m.transfer_action_post()}
          </Button>
        </div>
        {postReason && (
          <p className="text-xs text-muted-foreground">{postReason}</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmPost}
        onOpenChange={setConfirmPost}
        pending={posting}
        title={m.transfer_post_confirm_title()}
        specifics={(() => {
          const data = postConfirmSpecifics({
            lines: value.lines,
            fromName: warehouseName(value.fromWarehouseId),
            toName: warehouseName(value.toWarehouseId),
          });
          return m.transfer_post_confirm_specifics({
            lines: data.lineCount,
            qty: formatNumber(data.totalQty),
            from: data.fromName,
            to: data.toName,
          });
        })()}
        confirmLabel={m.transfer_action_post()}
        onConfirm={async () => {
          await onPost();
          setConfirmPost(false);
        }}
      />
    </>
  );
}

// Whole-transfer total qty for callers that need it outside the grid.
export function formTotalQty(value: TransferFormValue): number {
  return transferTotalQty(value.lines);
}
