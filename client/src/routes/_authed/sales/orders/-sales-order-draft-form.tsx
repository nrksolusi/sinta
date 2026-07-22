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
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Partner, Warehouse } from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";
import {
  gridToSalesOrderLines,
  type SalesOrderLineInput,
  salesOrderDraftBlockReason,
} from "./-sales-order-data";

// The editable draft payload the form produces. Notes optional; the grid's
// `cost` slot carries the unit price (a sales order does carry a price).
export interface SalesOrderDraftValues {
  customerId: string;
  warehouseId: string;
  docDate: string;
  notes: string;
  lines: GridLine[];
}

export interface SalesOrderPayload {
  customerId: string;
  warehouseId: string;
  docDate: string;
  notes: string;
  lines: SalesOrderLineInput[];
}

export interface SalesOrderDraftFormProps {
  initial: SalesOrderDraftValues;
  warehouses: Warehouse[];
  customers: Partner[];
  onSaveDraft: (payload: SalesOrderPayload) => Promise<void>;
  onPost: (payload: SalesOrderPayload) => Promise<void>;
  saving: boolean;
  posting: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyDraft(): SalesOrderDraftValues {
  return {
    customerId: "",
    warehouseId: "",
    docDate: today(),
    notes: "",
    lines: [],
  };
}

// Order value from the editable grid lines (qty * unit price), for the posting
// confirm specifics.
function gridTotalValue(lines: GridLine[]): number {
  return lineGridTotals(lines, { withCost: true }).totalValue;
}

export function SalesOrderDraftForm({
  initial,
  warehouses,
  customers,
  onSaveDraft,
  onPost,
  saving,
  posting,
}: SalesOrderDraftFormProps) {
  const [confirmPost, setConfirmPost] = useState(false);

  const toPayload = (value: SalesOrderDraftValues): SalesOrderPayload => ({
    customerId: value.customerId,
    warehouseId: value.warehouseId,
    docDate: value.docDate,
    notes: value.notes,
    lines: gridToSalesOrderLines(value.lines),
  });

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      await onSaveDraft(toPayload(value));
    },
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
              <Label id="so-customer-label">{m.so_field_customer()}</Label>
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
              <Label id="so-warehouse-label">{m.so_field_warehouse()}</Label>
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
              <Label htmlFor="so-doc-date">{m.so_field_date()}</Label>
              <Input
                id="so-doc-date"
                type="date"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="notes">
          {(field) => (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="so-notes">{m.so_field_notes()}</Label>
              <Textarea
                id="so-notes"
                rows={2}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{m.so_lines_title()}</h2>
        <form.Field name="lines">
          {(field) => (
            <LineGrid
              lines={field.state.value}
              onChange={(lines) => field.handleChange(lines)}
              withCost
              qtyLabel={m.so_qty_label()}
              readOnly={false}
              totals={lineGridTotals(field.state.value, { withCost: true })}
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
          const reason = salesOrderDraftBlockReason({
            customerId,
            warehouseId,
            lines,
          });
          const customer = customers.find((c) => c.id === customerId);
          const totals = lineGridTotals(lines, { withCost: true });
          return (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={saving || posting}
                >
                  {m.so_save_draft()}
                </Button>
                <Button
                  type="button"
                  disabled={reason != null || saving || posting}
                  onClick={() => setConfirmPost(true)}
                >
                  {m.so_post()}
                </Button>
              </div>
              {reason && (
                <p className="text-xs text-muted-foreground">{reason}</p>
              )}

              <ConfirmDialog
                open={confirmPost}
                onOpenChange={setConfirmPost}
                title={m.so_post_confirm_title()}
                specifics={m.so_post_confirm_specifics({
                  lines: totals.lines,
                  qty: formatNumber(totals.totalQty),
                  total: formatCurrency(gridTotalValue(lines)),
                  customer: customer ? customer.name : customerId,
                })}
                confirmLabel={m.so_post()}
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
