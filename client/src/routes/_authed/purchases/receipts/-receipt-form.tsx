import { useForm } from "@tanstack/react-form";
import { LineGrid, lineGridTotals } from "@/components/line-grid";
import { PartnerCombobox } from "@/components/partner-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WarehouseCombobox } from "@/components/warehouse-combobox";
import { m } from "@/paraglide/messages";
import type { ReceiptDraft, ReceiptGridLine } from "./-receipt-data";

// Passed via spread so Biome's JSX ARIA-role rule does not mistake the
// PartnerCombobox `role` prop (partner role, not an ARIA role) for markup.
const SUPPLIER_ROLE = { role: "supplier" } as const;

// The editable draft form shared by /new and /$id (draft). It owns no server
// state: the parent route passes the current draft and a change handler, and
// reads the same draft back when saving/posting. The LineGrid warehouseId feeds
// stock-on-hand into the product picker.
export interface ReceiptFormProps {
  draft: ReceiptDraft;
  onChange: (draft: ReceiptDraft) => void;
  // Rendered from the source PO when the draft was created from one.
  poNotice?: React.ReactNode;
}

export function ReceiptForm({ draft, onChange, poNotice }: ReceiptFormProps) {
  // TanStack Form drives the header fields; lines flow through LineGrid, which
  // is a controlled field array kept on the same draft object.
  // `draft` (held by the route) is the single source of truth so async prefills
  // (create-from-PO, draft hydration) and save/post never diverge from what's
  // shown. TanStack Form namespaces the header fields (labels, per-field state)
  // while each control's displayed value binds to `draft`; edits flow through
  // both the field (form state) and `patch` (the draft the route saves).
  const form = useForm({
    defaultValues: {
      supplierId: draft.supplierId,
      warehouseId: draft.warehouseId,
      docDate: draft.docDate,
      notes: draft.notes,
    },
  });

  const patch = (next: Partial<ReceiptDraft>) =>
    onChange({ ...draft, ...next });
  const setLines = (lines: ReceiptGridLine[]) => patch({ lines });

  const totals = lineGridTotals(draft.lines, { withCost: true });

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
      {poNotice}

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="supplierId">
          {(field) => (
            <div className="space-y-1">
              <Label id="receipt-supplier-label">
                {m.receipt_field_supplier()}
              </Label>
              <PartnerCombobox
                {...SUPPLIER_ROLE}
                value={draft.supplierId || undefined}
                onSelect={(partner) => {
                  field.handleChange(partner.id);
                  patch({ supplierId: partner.id });
                }}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="warehouseId">
          {(field) => (
            <div className="space-y-1">
              <Label id="receipt-warehouse-label">
                {m.receipt_field_warehouse()}
              </Label>
              <WarehouseCombobox
                value={draft.warehouseId || undefined}
                onSelect={(warehouse) => {
                  field.handleChange(warehouse.id);
                  patch({ warehouseId: warehouse.id });
                }}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="docDate">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="receipt-doc-date">{m.receipt_field_date()}</Label>
              <Input
                id="receipt-doc-date"
                type="date"
                className="h-9"
                value={draft.docDate}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  patch({ docDate: e.target.value });
                }}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="notes">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="receipt-notes">{m.receipt_field_notes()}</Label>
              <Textarea
                id="receipt-notes"
                rows={1}
                value={draft.notes}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  patch({ notes: e.target.value });
                }}
              />
            </div>
          )}
        </form.Field>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{m.receipt_lines_title()}</h2>
        <LineGrid
          lines={draft.lines}
          onChange={(lines) => setLines(lines as ReceiptGridLine[])}
          withCost
          qtyLabel={m.receipt_qty_label()}
          readOnly={false}
          totals={totals}
        />
      </section>
    </form>
  );
}
