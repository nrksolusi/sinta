import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  type GridLine,
  LineGrid,
  lineGridTotals,
} from "@/components/line-grid";
import { PartnerCombobox } from "@/components/partner-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WarehouseCombobox } from "@/components/warehouse-combobox";
import { formatNumber } from "@/lib/format";
import type { Warehouse } from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";
import {
  type DeliveryLineInput,
  deliveryTotalQty,
  gridToDeliveryLines,
} from "./-deliveries-data";

// The editable draft payload the form produces. Notes optional; lines carry
// their own GridLine keys so salesOrderLineIds (create-from-source) stays keyed.
export interface DeliveryDraftValues {
  customerId: string;
  warehouseId: string;
  docDate: string;
  notes: string;
  lines: GridLine[];
}

export interface DeliveryDraftFormProps {
  initial: DeliveryDraftValues;
  warehouses: Warehouse[];
  // gridLine.key -> sales order line id, threaded into the payload on submit.
  salesOrderLineIds?: Record<string, string>;
  // Source label (e.g. "Pesanan penjualan SO-...") rendered read-only when the
  // draft was created from a sales order.
  sourceLabel?: string;
  onSaveDraft: (payload: DeliveryPayload) => Promise<void>;
  onPost: (payload: DeliveryPayload) => Promise<void>;
  saving: boolean;
  posting: boolean;
}

export interface DeliveryPayload {
  customerId: string;
  warehouseId: string;
  docDate: string;
  notes: string;
  lines: DeliveryLineInput[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyDraft(): DeliveryDraftValues {
  return {
    customerId: "",
    warehouseId: "",
    docDate: today(),
    notes: "",
    lines: [],
  };
}

export function DeliveryDraftForm({
  initial,
  warehouses,
  salesOrderLineIds = {},
  sourceLabel,
  onSaveDraft,
  onPost,
  saving,
  posting,
}: DeliveryDraftFormProps) {
  const [confirmPost, setConfirmPost] = useState(false);

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      await onSaveDraft(toPayload(value));
    },
  });

  const toPayload = (value: DeliveryDraftValues): DeliveryPayload => ({
    customerId: value.customerId,
    warehouseId: value.warehouseId,
    docDate: value.docDate,
    notes: value.notes,
    lines: gridToDeliveryLines(value.lines, salesOrderLineIds),
  });

  // Preselect the sole warehouse when nothing is chosen (matches the document
  // pickers' preselect-single behaviour). Only applies to a fresh draft.
  const soleWarehouseId =
    !initial.warehouseId && warehouses.length === 1
      ? warehouses[0].id
      : initial.warehouseId;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <form.Field name="customerId">
          {(field) => (
            <div className="space-y-1">
              <Label id="delivery-customer-label">
                {m.delivery_field_customer()}
              </Label>
              {/* biome-ignore lint/a11y/useValidAriaRole: `role` is a
                  PartnerCombobox prop (supplier|customer), not an ARIA role. */}
              <PartnerCombobox
                role="customer"
                value={field.state.value || undefined}
                onSelect={(partner) => field.handleChange(partner.id)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="warehouseId" defaultValue={soleWarehouseId}>
          {(field) => (
            <div className="space-y-1">
              <Label id="delivery-warehouse-label">
                {m.delivery_field_warehouse()}
              </Label>
              <WarehouseCombobox
                value={field.state.value || undefined}
                onSelect={(w) => field.handleChange(w.id)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="docDate">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="delivery-doc-date">
                {m.delivery_field_date()}
              </Label>
              <Input
                id="delivery-doc-date"
                type="date"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        {sourceLabel && (
          <div className="space-y-1">
            <Label>{m.delivery_field_source()}</Label>
            <p className="pt-2 font-mono text-sm">{sourceLabel}</p>
          </div>
        )}

        <form.Field name="notes">
          {(field) => (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="delivery-notes">{m.delivery_field_notes()}</Label>
              <Textarea
                id="delivery-notes"
                rows={2}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{m.delivery_lines_title()}</h2>
        <form.Field name="lines">
          {(field) => (
            <LineGrid
              lines={field.state.value}
              onChange={(lines) => field.handleChange(lines)}
              withCost={false}
              qtyLabel={m.delivery_qty_label()}
              readOnly={false}
              totals={lineGridTotals(field.state.value, { withCost: false })}
            />
          )}
        </form.Field>
      </section>

      <form.Subscribe
        selector={(state) => ({
          customerId: state.values.customerId,
          warehouseId: state.values.warehouseId,
          lines: state.values.lines,
        })}
      >
        {({ customerId, warehouseId, lines }) => {
          const reason = draftBlockReason({ customerId, warehouseId, lines });
          const warehouse = warehouses.find((w) => w.id === warehouseId);
          return (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={saving || posting}
                >
                  {m.delivery_save_draft()}
                </Button>
                <Button
                  type="button"
                  disabled={reason != null || saving || posting}
                  onClick={() => setConfirmPost(true)}
                >
                  {m.delivery_post()}
                </Button>
              </div>
              {reason && (
                <p className="text-xs text-muted-foreground">{reason}</p>
              )}

              <ConfirmDialog
                open={confirmPost}
                onOpenChange={setConfirmPost}
                title={m.delivery_post_confirm_title()}
                specifics={m.delivery_post_confirm_specifics({
                  lines: lines.length,
                  qty: formatNumber(deliveryTotalQty(lines)),
                  warehouse: warehouse
                    ? `${warehouse.code} ${warehouse.name}`
                    : warehouseId,
                })}
                confirmLabel={m.delivery_post()}
                pending={posting}
                onConfirm={async () => {
                  await onPost(toPayload(form.state.values));
                }}
              />
            </div>
          );
        }}
      </form.Subscribe>
    </form>
  );
}

// The reason posting is unavailable, or null when it is allowed. Shown as a
// caption under the button, never a bare disabled control (UX-D10).
export function draftBlockReason({
  customerId,
  warehouseId,
  lines,
}: {
  customerId: string;
  warehouseId: string;
  lines: GridLine[];
}): string | null {
  if (!customerId) return m.delivery_reason_no_customer();
  if (!warehouseId) return m.delivery_reason_no_warehouse();
  if (lines.length === 0 || !lines.every((l) => Number(l.qty) > 0)) {
    return m.delivery_reason_no_lines();
  }
  return null;
}
