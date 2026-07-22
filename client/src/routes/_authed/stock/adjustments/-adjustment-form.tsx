import {
  type GridLine,
  LineGrid,
  lineGridTotals,
} from "@/components/line-grid";
import { SelectField } from "@/components/select-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WarehouseCombobox } from "@/components/warehouse-combobox";
import { m } from "@/paraglide/messages";
import { reasonOptions } from "./-adjustments-data";

export interface AdjustmentDraft {
  warehouseId: string;
  reason: string;
  docDate: string;
  lines: GridLine[];
}

// The editable draft body shared by the "new" route and the draft state of the
// detail page: Gudang / Alasan (required) / Tanggal, then the signed +/- cost
// LineGrid. Purely controlled; the caller owns state, actions, and the sticky
// action bar.
export function AdjustmentForm({
  value,
  onChange,
  warehouseLabel,
}: {
  value: AdjustmentDraft;
  onChange: (next: AdjustmentDraft) => void;
  // "GD-01 Gudang Utama" for the currently selected warehouse; the combobox is
  // search-only, so the picked warehouse is echoed below it.
  warehouseLabel?: string;
}) {
  const totals = lineGridTotals(value.lines, {
    withCost: true,
    signedQty: true,
  });

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{m.adjustment_section_detail()}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label id="adjustment-warehouse-label">{m.field_warehouse()}</Label>
            <WarehouseCombobox
              onSelect={(w) => onChange({ ...value, warehouseId: w.id })}
            />
            {warehouseLabel && (
              <p className="text-xs text-muted-foreground">{warehouseLabel}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label id="adjustment-reason-label">
              {m.adjustment_field_reason()}
            </Label>
            <SelectField
              options={reasonOptions()}
              value={value.reason || undefined}
              onValueChange={(reason) =>
                onChange({ ...value, reason: reason ?? "" })
              }
              placeholder={m.adjustment_field_reason_placeholder()}
              aria-labelledby="adjustment-reason-label"
              className="w-full"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="adjustment-doc-date">{m.field_doc_date()}</Label>
            <Input
              id="adjustment-doc-date"
              type="date"
              value={value.docDate}
              onChange={(e) => onChange({ ...value, docDate: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{m.adjustment_section_lines()}</h2>
        <LineGrid
          lines={value.lines}
          onChange={(lines) => onChange({ ...value, lines })}
          withCost
          signedQty
          qtyLabel={m.adjustment_qty_label()}
          readOnly={false}
          totals={totals}
        />
      </section>
    </div>
  );
}
