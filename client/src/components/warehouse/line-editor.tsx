import { useState } from "react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button } from "@/components/ui/button";
import { resolveProductByBarcode } from "@/lib/barcode";
import type { Product } from "@/lib/catalog";
import { m } from "@/paraglide/messages";

// One editable document line. qty is always present; cost is present only for
// goods receipts. countedQty replaces qty on the opname sheet (handled by the
// caller via the `qtyLabel`).
export interface DocLine {
  key: string;
  productId: string;
  uom: string;
  qty: string;
  cost?: string;
}

export interface LineEditorProps {
  products: Product[];
  lines: DocLine[];
  onChange: (lines: DocLine[]) => void;
  // Show a per-line unit-cost input (goods receipt only).
  withCost?: boolean;
  // Label for the primary quantity input (e.g. counted qty on opname).
  qtyLabel: string;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `line-${keySeq}`;
}

// Product line list shared by the receive, delivery, and opname screens. Lines
// are added by picking a product or scanning its barcode; each carries a
// quantity (in the product's base unit) and, for receipts, a unit cost.
export function LineEditor({
  products,
  lines,
  onChange,
  withCost = false,
  qtyLabel,
}: LineEditorProps) {
  const [scanning, setScanning] = useState(false);

  const addProduct = (product: Product) => {
    // Merge onto an existing line for the same product rather than duplicating.
    const existing = lines.find((l) => l.productId === product.id);
    if (existing) return;
    onChange([
      ...lines,
      { key: nextKey(), productId: product.id, uom: product.baseUom, qty: "" },
    ]);
  };

  const handleScan = (barcode: string) => {
    const product = resolveProductByBarcode(barcode, products);
    setScanning(false);
    if (product) addProduct(product);
  };

  const updateLine = (key: string, patch: Partial<DocLine>) => {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    onChange(lines.filter((l) => l.key !== key));
  };

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? id;
  const productSku = (id: string) =>
    products.find((p) => p.id === id)?.sku ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="flex-1 space-y-1">
          <span className="text-sm font-medium">{m.line_add_product()}</span>
          <select
            className="w-full rounded-md border px-3 py-2"
            value=""
            onChange={(e) => {
              const product = products.find((p) => p.id === e.target.value);
              if (product) addProduct(product);
            }}
          >
            <option value="" disabled>
              {m.line_pick_product()}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          className="self-end"
          onClick={() => setScanning((s) => !s)}
        >
          {scanning ? m.scan_close() : m.line_scan()}
        </Button>
      </div>

      {scanning && (
        <div className="rounded-lg border p-3">
          <BarcodeScanner
            onScan={handleScan}
            onClose={() => setScanning(false)}
          />
        </div>
      )}

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.line_empty()}</p>
      ) : (
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.key} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {productName(line.productId)}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {productSku(line.productId)} - {line.uom}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeLine(line.key)}
                  aria-label={m.line_remove()}
                >
                  {m.line_remove()}
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">{qtyLabel}</span>
                  <input
                    className="w-full rounded-md border px-3 py-2"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={line.qty}
                    onChange={(e) =>
                      updateLine(line.key, { qty: e.target.value })
                    }
                  />
                </label>
                {withCost && (
                  <label className="space-y-1">
                    <span className="text-sm font-medium">
                      {m.line_unit_cost()}
                    </span>
                    <input
                      className="w-full rounded-md border px-3 py-2"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.cost ?? ""}
                      onChange={(e) =>
                        updateLine(line.key, { cost: e.target.value })
                      }
                    />
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
