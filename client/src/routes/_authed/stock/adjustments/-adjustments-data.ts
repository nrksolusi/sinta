import type { DocRow } from "@/components/doc-list";
import type { GridLine } from "@/components/line-grid";
import type { components } from "@/lib/api-types";
import type { Product, Warehouse } from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";

export type StockAdjustment = components["schemas"]["StockAdjustment"];
export type StockAdjustmentLineInput =
  components["schemas"]["StockAdjustmentLineInput"];

// The reason is a free-text field on the API; the UI offers a curated list of
// the reasons Indonesian distributors actually record, stored as the label so
// the value reads the same on the list and detail pages.
export function reasonOptions(): { value: string; label: string }[] {
  return [
    {
      value: m.adjustment_reason_damaged(),
      label: m.adjustment_reason_damaged(),
    },
    { value: m.adjustment_reason_lost(), label: m.adjustment_reason_lost() },
    { value: m.adjustment_reason_found(), label: m.adjustment_reason_found() },
    {
      value: m.adjustment_reason_expired(),
      label: m.adjustment_reason_expired(),
    },
    {
      value: m.adjustment_reason_correction(),
      label: m.adjustment_reason_correction(),
    },
    { value: m.adjustment_reason_other(), label: m.adjustment_reason_other() },
  ];
}

// The per-line sign lives outside the qty string in the LineGrid model, so the
// stored qty is always the unsigned magnitude the user typed. The API line, by
// contrast, carries one signed decimal string. These two helpers are the only
// place that translation happens.

// LineGrid lines -> API line inputs: fold the sign into a signed qty string and
// drop unitCost when the user left it blank (the server values decreases at
// current cost). Never double-negate a qty the user already typed with a "-".
export function gridLinesToPayload(
  lines: GridLine[],
): StockAdjustmentLineInput[] {
  return lines.map((line) => {
    const magnitude = line.qty.trim().replace(/^-/, "");
    const qty = line.sign === -1 ? `-${magnitude}` : magnitude;
    const cost = line.cost?.trim();
    return {
      productId: line.product.id,
      uom: line.product.baseUom,
      qty,
      ...(cost ? { unitCost: cost } : {}),
    };
  });
}

// API lines -> LineGrid lines: split the signed qty into an unsigned magnitude
// plus a sign, and resolve each productId against the loaded catalog (falling
// back to a placeholder so an archived/unknown product still renders).
export function linesFromAdjustment(
  adjustment: StockAdjustment,
  products: Product[],
): GridLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return adjustment.lines.map((line, index) => {
    const product = byId.get(line.productId) ?? placeholderProduct(line);
    const signed = Number(line.qty);
    const sign: 1 | -1 = signed < 0 ? -1 : 1;
    const magnitude = line.qty.trim().replace(/^-/, "");
    return {
      key: `adj-line-${line.id ?? index}`,
      product,
      qty: magnitude,
      cost: line.unitCost ?? "",
      sign,
    };
  });
}

function placeholderProduct(line: StockAdjustment["lines"][number]): Product {
  return {
    id: line.productId,
    name: line.productId,
    sku: line.productId,
    baseUom: line.uom,
    isBatchTracked: false,
    status: "active",
  };
}

export interface NetEffect {
  increase: number;
  decrease: number;
}

// Sum the magnitudes of increase and decrease lines separately, for the "+X /
// -Y" restatement in the posting confirmation.
export function adjustmentNetEffect(lines: GridLine[]): NetEffect {
  let increase = 0;
  let decrease = 0;
  for (const line of lines) {
    const qty = Number(line.qty);
    if (Number.isNaN(qty) || qty === 0) continue;
    const magnitude = Math.abs(qty);
    if (line.sign === -1) decrease += magnitude;
    else increase += magnitude;
  }
  return { increase, decrease };
}

export type DraftBlocker = "warehouse" | "reason" | "lines";

// Why a draft cannot yet be saved/posted, in the order the form fields appear;
// null means it is ready. Drives the caption under the disabled action so no
// control is disabled without a visible reason (UX design-principle D).
export function draftUnavailableReason(input: {
  warehouseId: string;
  reason: string;
  lines: GridLine[];
}): DraftBlocker | null {
  if (!input.warehouseId) return "warehouse";
  if (input.reason.trim() === "") return "reason";
  if (input.lines.length === 0) return "lines";
  const everyLineValid = input.lines.every((line) => {
    const qty = Number(line.qty);
    return !Number.isNaN(qty) && qty > 0;
  });
  if (!everyLineValid) return "lines";
  return null;
}

// Signed total value of an adjustment's lines (increases add, decreases
// subtract), for the list Total column.
function signedValue(adjustment: StockAdjustment): number {
  let total = 0;
  for (const line of adjustment.lines) {
    const qty = Number(line.qty);
    const cost = Number(line.unitCost);
    if (Number.isNaN(qty) || Number.isNaN(cost)) continue;
    total += qty * cost;
  }
  return total;
}

// StockAdjustment records -> DocList rows. The counterparty slot carries the
// reason (adjustments have no partner); warehouse shows the mono code.
export function adjustmentDocRows(
  adjustments: StockAdjustment[],
  warehouses: Warehouse[],
): DocRow[] {
  const codeById = new Map(warehouses.map((w) => [w.id, w.code]));
  return adjustments.map((adjustment) => ({
    id: adjustment.id,
    number: adjustment.docNumber ?? null,
    date: adjustment.docDate,
    counterparty: adjustment.reason,
    warehouse: codeById.get(adjustment.warehouseId) ?? adjustment.warehouseId,
    total: signedValue(adjustment),
    status: adjustment.status,
  }));
}
