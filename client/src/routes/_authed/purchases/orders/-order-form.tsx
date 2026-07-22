import { useForm } from "@tanstack/react-form";
import {
  type GridLine,
  LineGrid,
  lineGridTotals,
} from "@/components/line-grid";
import { PartnerCombobox } from "@/components/partner-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WarehouseCombobox } from "@/components/warehouse-combobox";
import { m } from "@/paraglide/messages";
import type { OrderDraft } from "./-order-data";

// Passed via spread so Biome's JSX ARIA-role rule does not mistake the
// PartnerCombobox `role` prop (partner role, not an ARIA role) for markup.
const SUPPLIER_ROLE = { role: "supplier" } as const;

// The editable draft form shared by /new and /$id (draft). It owns no server
// state: the parent route passes the current draft and a change handler, and
// reads the same draft back when saving/posting. `draft` (held by the route) is
// the single source of truth so async prefills and draft hydration never
// diverge from what's shown. TanStack Form namespaces the header fields while
// each control's displayed value binds to `draft`.
export interface OrderFormProps {
  draft: OrderDraft;
  onChange: (draft: OrderDraft) => void;
}

export function OrderForm({ draft, onChange }: OrderFormProps) {
  const form = useForm({
    defaultValues: {
      supplierId: draft.supplierId,
      warehouseId: draft.warehouseId,
      docDate: draft.docDate,
      notes: draft.notes,
    },
  });

  const patch = (next: Partial<OrderDraft>) => onChange({ ...draft, ...next });
  const setLines = (lines: GridLine[]) => patch({ lines });

  const totals = lineGridTotals(draft.lines, { withCost: true });

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="supplierId">
          {(field) => (
            <div className="space-y-1">
              <Label id="order-supplier-label">{m.po_field_supplier()}</Label>
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
              <Label id="order-warehouse-label">{m.po_field_warehouse()}</Label>
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
              <Label htmlFor="order-doc-date">{m.po_field_date()}</Label>
              <Input
                id="order-doc-date"
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
              <Label htmlFor="order-notes">{m.po_field_notes()}</Label>
              <Textarea
                id="order-notes"
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
        <h2 className="text-sm font-medium">{m.po_lines_title()}</h2>
        <LineGrid
          lines={draft.lines}
          onChange={(lines) => setLines(lines)}
          withCost
          qtyLabel={m.po_qty_label()}
          readOnly={false}
          totals={totals}
        />
      </section>
    </form>
  );
}
