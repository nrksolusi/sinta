// Pure domain logic for the stock opname count-sheet flow (prototype D5,
// UX-D3). Kept free of React so the sheet generation, off-sheet append,
// client-side variance estimate, and draft resume are tested in isolation.
//
// Design notes rooted in the API and the redesign plan:
//   - The sheet is generated from /reports/stock-on-hand for the warehouse,
//     one row per product+batch. Uncounted rows carry countedQty === null and
//     are NEVER defaulted to 0 (ERPNext/Odoo: never zero implicitly).
//   - Opname lines store only countedQty; the server computes the real
//     variance at post. The review's selisih and value are a CLIENT-SIDE
//     estimate against current stock-on-hand + valuation avgCost, labelled as
//     such (see docs/plans/fix-2-ui-redesign.md "API gaps" #1).
import type { components } from "@/lib/api-types";

type StockOnHandRow = components["schemas"]["StockOnHandRow"];
type StockValuationRow = components["schemas"]["StockValuationRow"];
type StockOpname = components["schemas"]["StockOpname"];
type StockOpnameLineInput = components["schemas"]["StockOpnameLineInput"];

// One editable line on the count sheet. `key` uniquely identifies a
// product+batch pairing (stable React key and lookup handle). `countedQty` is
// null while uncounted; an explicit 0 means "counted, found none".
export interface SheetRow {
  key: string;
  productId: string;
  productName: string;
  sku: string;
  batchId?: string;
  batchNo?: string;
  systemQty: number;
  uom: string;
  countedQty: number | null;
  // True when appended by scan/search for a product with no stock on the sheet.
  offSheet: boolean;
}

// Minimal product facts the sheet needs, indexed by product id. Sourced from
// the catalog product list (name/sku/baseUom) at the call site.
export interface ProductFacts {
  name?: string;
  sku?: string;
  baseUom?: string;
}

// A product record as handed back by ProductCombobox / resolved from a scan.
export interface PickedProduct {
  id: string;
  name: string;
  sku: string;
  baseUom: string;
  status?: string;
  isBatchTracked?: boolean;
}

// Composite key for a product+batch pairing. Non-batched stock uses an empty
// batch segment so it collapses to a single row per product.
export function rowKey(productId: string, batchId?: string | null): string {
  return `${productId}::${batchId ?? ""}`;
}

// Generate the count sheet from the warehouse's stock-on-hand rows: one row per
// product+batch, uncounted, carrying the system qty for the (default) show-qty
// mode. Blind mode simply hides systemQty in the UI; the value still travels
// so the review can estimate variance.
export function buildSheet(
  soh: StockOnHandRow[],
  products: Map<string, ProductFacts>,
): SheetRow[] {
  return soh.map((row) => ({
    key: rowKey(row.productId, row.batchId),
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    batchId: row.batchId,
    batchNo: row.batchNo,
    systemQty: Number(row.qtyOnHand),
    uom: products.get(row.productId)?.baseUom ?? "",
    countedQty: null,
    offSheet: false,
  }));
}

// Resolve a scanned/picked product to a sheet row. When the product already has
// a (non-batch) row, return its key so the caller focuses that row. Otherwise
// append a zero-system off-sheet row (scan found a product with no stock).
export function appendOffSheetRow(
  sheet: SheetRow[],
  product: PickedProduct,
): { sheet: SheetRow[]; key: string; appended: boolean } {
  const existing = sheet.find((r) => r.productId === product.id && !r.batchId);
  if (existing) {
    return { sheet, key: existing.key, appended: false };
  }
  const key = rowKey(product.id);
  const added: SheetRow = {
    key,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    systemQty: 0,
    uom: product.baseUom,
    countedQty: null,
    offSheet: true,
  };
  return { sheet: [...sheet, added], key, appended: true };
}

// One reviewed variance line (a counted row). variance = counted - system;
// valueEstimate = variance * avgCost (negative = shrink, positive = surplus).
export interface ReviewLine {
  key: string;
  productId: string;
  productName: string;
  sku: string;
  batchNo?: string;
  uom: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  valueEstimate: number;
}

export interface ReviewUncounted {
  key: string;
  productId: string;
  productName: string;
  sku: string;
  batchNo?: string;
}

export interface Review {
  counted: ReviewLine[];
  uncounted: ReviewUncounted[];
  // Counted rows whose variance is non-zero - what the confirm restates.
  varianceLineCount: number;
  totalValueEstimate: number;
}

function avgCostFor(
  valuation: StockValuationRow[],
  productId: string,
  batchId?: string,
): number {
  const match = valuation.find(
    (v) => v.productId === productId && (v.batchId ?? undefined) === batchId,
  );
  return match ? Number(match.avgCost) : 0;
}

// Client-side variance estimate. Uncounted rows are EXCLUDED (never zeroed
// implicitly) and returned separately so the UI lists skipped rows by name.
export function computeReview(
  sheet: SheetRow[],
  valuation: StockValuationRow[],
): Review {
  const counted: ReviewLine[] = [];
  const uncounted: ReviewUncounted[] = [];
  let totalValueEstimate = 0;
  let varianceLineCount = 0;

  for (const row of sheet) {
    if (row.countedQty === null) {
      uncounted.push({
        key: row.key,
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        batchNo: row.batchNo,
      });
      continue;
    }
    const variance = row.countedQty - row.systemQty;
    const valueEstimate =
      variance * avgCostFor(valuation, row.productId, row.batchId);
    if (variance !== 0) varianceLineCount += 1;
    totalValueEstimate += valueEstimate;
    counted.push({
      key: row.key,
      productId: row.productId,
      productName: row.productName,
      sku: row.sku,
      batchNo: row.batchNo,
      uom: row.uom,
      systemQty: row.systemQty,
      countedQty: row.countedQty,
      variance,
      valueEstimate,
    });
  }

  return { counted, uncounted, varianceLineCount, totalValueEstimate };
}

// Rows that carry a count, in sheet order. Uncounted rows are skipped at
// posting (their absence is the deliberate "not counted" decision).
export function countedLines(sheet: SheetRow[]): SheetRow[] {
  return sheet.filter((r) => r.countedQty !== null);
}

// Serialise one counted row to the API line-input shape. Quantities travel as
// decimal strings (never floats), in base units.
export function toLineInput(row: SheetRow): StockOpnameLineInput {
  const line: StockOpnameLineInput = {
    productId: row.productId,
    uom: row.uom,
    countedQty: String(row.countedQty ?? 0),
  };
  if (row.batchId) line.batchId = row.batchId;
  return line;
}

// Rebuild the sheet for a saved draft: regenerate from current stock-on-hand,
// then overlay saved counts by product+batch. Saved lines whose product is no
// longer on the sheet (off-sheet additions) are appended with zero system qty.
export function resumeSheet(
  opname: StockOpname,
  soh: StockOnHandRow[],
  products: Map<string, ProductFacts>,
): SheetRow[] {
  const sheet = buildSheet(soh, products);
  const byKey = new Map(sheet.map((r) => [r.key, r] as const));

  for (const line of opname.lines) {
    const key = rowKey(line.productId, line.batchId);
    const counted = Number(line.countedQty);
    const existing = byKey.get(key);
    if (existing) {
      existing.countedQty = counted;
      continue;
    }
    const facts = products.get(line.productId);
    const appended: SheetRow = {
      key,
      productId: line.productId,
      productName: facts?.name ?? line.productId,
      sku: facts?.sku ?? "",
      batchId: line.batchId ?? undefined,
      systemQty: 0,
      uom: line.uom || facts?.baseUom || "",
      countedQty: counted,
      offSheet: true,
    };
    byKey.set(key, appended);
    sheet.push(appended);
  }

  return sheet;
}
