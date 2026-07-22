import { MinusIcon, PlusIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { EmptyState } from "@/components/empty-state";
import { ProductCombobox } from "@/components/product-combobox";
import { ScannerDialog } from "@/components/scanner-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Product } from "@/lib/pickers-data";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

// One editable grid line. qty/cost are numeric strings (never floats). sign is
// only meaningful when the grid is in signedQty mode (+1 increase, -1 decrease).
export interface GridLine {
  key: string;
  product: Product;
  qty: string;
  cost?: string;
  sign?: 1 | -1;
}

export interface LineGridTotals {
  lines: number;
  totalQty: number;
  totalValue: number;
}

export interface LineGridProps {
  lines: GridLine[];
  onChange: (lines: GridLine[]) => void;
  withCost: boolean;
  qtyLabel: string;
  readOnly: boolean;
  signedQty?: boolean;
  totals: LineGridTotals;
}

// Product ids to surface as recents in the search box (empty query). Optional
// pass-through kept off the frozen prop list; callers may set it via context in
// a later wave. For now recents come from the current lines' products.

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `grid-line-${keySeq}`;
}

// Signed qty for a line: negative when the grid is signed and the line's sign is
// -1. In an unsigned grid, qty is always taken as-is.
function signedQtyValue(line: GridLine, signed: boolean): number {
  const qty = Number(line.qty);
  if (Number.isNaN(qty)) return 0;
  return signed && line.sign === -1 ? -qty : qty;
}

// Fold lines into the sticky-bar totals. Value uses the signed qty so
// adjustments net out; unsigned docs sum straight.
export function lineGridTotals(
  lines: GridLine[],
  opts: { withCost: boolean; signedQty?: boolean },
): LineGridTotals {
  let totalQty = 0;
  let totalValue = 0;
  for (const line of lines) {
    const qty = signedQtyValue(line, Boolean(opts.signedQty));
    totalQty += qty;
    if (opts.withCost) {
      const cost = Number(line.cost);
      if (!Number.isNaN(cost)) totalValue += qty * cost;
    }
  }
  return { lines: lines.length, totalQty, totalValue };
}

function lineValue(line: GridLine, signed: boolean): number {
  const cost = Number(line.cost);
  if (Number.isNaN(cost)) return 0;
  return signedQtyValue(line, signed) * cost;
}

export function LineGrid({
  lines,
  onChange,
  withCost,
  qtyLabel,
  readOnly,
  signedQty = false,
  totals,
}: LineGridProps) {
  const [scanning, setScanning] = useState(false);
  const [invalid, setInvalid] = useState<Record<string, "qty" | "cost">>({});
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());
  const searchRef = useRef<HTMLDivElement>(null);
  const focusKey = useRef<string | null>(null);

  // After a select appends/increments a row, focus + select its qty cell.
  useLayoutEffect(() => {
    if (!focusKey.current) return;
    const el = qtyRefs.current.get(focusKey.current);
    focusKey.current = null;
    if (el) {
      el.focus();
      el.select();
    }
  });

  // Clear the increment flash shortly after it fires.
  useEffect(() => {
    if (!flashKey) return;
    const handle = setTimeout(() => setFlashKey(null), 600);
    return () => clearTimeout(handle);
  }, [flashKey]);

  const focusSearch = useCallback(() => {
    const region = searchRef.current;
    if (!region) return;
    // Prefer the combobox's text input; fall back to the first focusable so the
    // caller always lands back in the search region after a commit.
    const target =
      region.querySelector<HTMLElement>("input") ??
      region.querySelector<HTMLElement>(
        "button, [tabindex]:not([tabindex='-1'])",
      );
    target?.focus();
  }, []);

  const addProduct = useCallback(
    (product: Product) => {
      const existing = lines.find((l) => l.product.id === product.id);
      if (existing) {
        // Increment, never silent-merge: bump qty by 1 and flash the row.
        const current = Number(existing.qty);
        const next = (Number.isNaN(current) ? 0 : current) + 1;
        onChange(
          lines.map((l) =>
            l.key === existing.key ? { ...l, qty: String(next) } : l,
          ),
        );
        setFlashKey(existing.key);
        focusKey.current = existing.key;
        return;
      }
      const line: GridLine = {
        key: nextKey(),
        product,
        qty: "1",
        ...(withCost ? { cost: "" } : {}),
        ...(signedQty ? { sign: 1 as const } : {}),
      };
      onChange([...lines, line]);
      focusKey.current = line.key;
    },
    [lines, onChange, withCost, signedQty],
  );

  const updateLine = useCallback(
    (key: string, patch: Partial<GridLine>) => {
      onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    },
    [lines, onChange],
  );

  const removeLine = useCallback(
    (key: string) => {
      onChange(lines.filter((l) => l.key !== key));
      setInvalid((prev) => {
        const { [key]: _drop, ...rest } = prev;
        return rest;
      });
    },
    [lines, onChange],
  );

  const toggleSign = useCallback(
    (line: GridLine) => {
      updateLine(line.key, { sign: line.sign === -1 ? 1 : -1 });
    },
    [updateLine],
  );

  // Validation on blur only: flag but never block typing.
  const validateOn = (key: string, field: "qty" | "cost", raw: string) => {
    const value = Number(raw);
    const bad =
      field === "qty"
        ? raw.trim() === "" || Number.isNaN(value) || value <= 0
        : raw.trim() !== "" && (Number.isNaN(value) || value < 0);
    setInvalid((prev) => {
      if (bad) return { ...prev, [key]: field };
      const { [key]: current, ...rest } = prev;
      return current === field ? rest : prev;
    });
  };

  if (lines.length === 0 && readOnly) {
    return (
      <EmptyState
        variant="first-use"
        title={m.linegrid_empty_title()}
        description={m.linegrid_empty_description()}
      />
    );
  }

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex items-start gap-2" data-testid="line-grid-search">
          <div ref={searchRef} className="min-w-0 flex-1">
            <ProductCombobox
              onSelect={addProduct}
              recentIds={lines.map((l) => l.product.id)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9 shrink-0"
            onClick={() => setScanning(true)}
          >
            {m.combobox_scan()}
          </Button>
        </div>
      )}

      {!readOnly && (
        <ScannerDialog
          open={scanning}
          onOpenChange={setScanning}
          onScan={() => {
            // Barcode resolution to a product is owned by the search seam in a
            // later wave; the dialog closes and focus returns to search.
            focusSearch();
          }}
        />
      )}

      {lines.length === 0 ? (
        <EmptyState
          variant="first-use"
          title={m.linegrid_empty_title()}
          description={m.linegrid_empty_description()}
        />
      ) : (
        <LineRows
          lines={lines}
          qtyLabel={qtyLabel}
          withCost={withCost}
          readOnly={readOnly}
          signedQty={signedQty}
          invalid={invalid}
          flashKey={flashKey}
          qtyRefs={qtyRefs}
          onUpdate={updateLine}
          onRemove={removeLine}
          onToggleSign={toggleSign}
          onValidate={validateOn}
          onCommit={focusSearch}
        />
      )}

      {/* Sticky totals bar. */}
      <div
        data-testid="line-grid-totals"
        className="sticky bottom-0 flex h-14 items-center gap-6 border-t bg-background px-3"
      >
        <span className="text-sm text-muted-foreground">
          {m.linegrid_totals_lines({ count: totals.lines })}
        </span>
        <span className="text-sm">
          {m.linegrid_totals_qty()}:{" "}
          <span className="font-mono tabular-nums">
            {formatNumber(totals.totalQty)}
          </span>
        </span>
        {withCost && (
          <span className="ml-auto text-sm">
            {m.linegrid_totals_value()}:{" "}
            <span className="font-mono tabular-nums">
              {formatCurrency(totals.totalValue)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

interface LineRowsProps {
  lines: GridLine[];
  qtyLabel: string;
  withCost: boolean;
  readOnly: boolean;
  signedQty: boolean;
  invalid: Record<string, "qty" | "cost">;
  flashKey: string | null;
  qtyRefs: React.RefObject<Map<string, HTMLInputElement>>;
  onUpdate: (key: string, patch: Partial<GridLine>) => void;
  onRemove: (key: string) => void;
  onToggleSign: (line: GridLine) => void;
  onValidate: (key: string, field: "qty" | "cost", raw: string) => void;
  onCommit: () => void;
}

// The line rows, rendered as one responsive table: a dense grid on md+, and
// stacked cards on mobile (cells become blocks with data-label captions). A
// single DOM keeps one input per line so focus/Tab order stay linear.
function LineRows({
  lines,
  qtyLabel,
  withCost,
  readOnly,
  signedQty,
  invalid,
  flashKey,
  qtyRefs,
  onUpdate,
  onRemove,
  onToggleSign,
  onValidate,
  onCommit,
}: LineRowsProps) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm max-md:block">
        <thead className="max-md:hidden">
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">
              {m.linegrid_col_product()}
            </th>
            {signedQty && <th className="w-28 px-3 py-2" />}
            <th className="w-32 px-3 py-2 text-right font-medium">
              {qtyLabel}
            </th>
            {withCost && (
              <th className="w-36 px-3 py-2 text-right font-medium">
                {m.linegrid_col_cost()}
              </th>
            )}
            {withCost && (
              <th className="w-36 px-3 py-2 text-right font-medium">
                {m.linegrid_col_total()}
              </th>
            )}
            {!readOnly && <th className="w-12 px-3 py-2" />}
          </tr>
        </thead>
        <tbody className="max-md:block">
          {lines.map((line) => (
            <tr
              key={line.key}
              className={cn(
                "border-b transition-colors last:border-0 md:h-11",
                "max-md:block max-md:space-y-2 max-md:p-3",
                flashKey === line.key && "bg-warning/20",
              )}
            >
              <td className="px-3 py-1.5 max-md:block max-md:px-0 max-md:py-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {line.product.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{line.product.sku}</span> ·{" "}
                      {line.product.baseUom}
                    </div>
                  </div>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="md:hidden"
                      aria-label={m.linegrid_remove()}
                      onClick={() => onRemove(line.key)}
                    >
                      <MinusIcon />
                    </Button>
                  )}
                </div>
              </td>
              {signedQty && (
                <td className="px-3 py-1.5 max-md:block max-md:px-0 max-md:py-0">
                  {readOnly ? (
                    <span className="font-mono">
                      {line.sign === -1 ? "−" : "+"}
                    </span>
                  ) : (
                    <SignToggle line={line} onToggle={onToggleSign} />
                  )}
                </td>
              )}
              <td className="px-3 py-1.5 text-right max-md:block max-md:px-0 max-md:py-0">
                <span className="mb-1 hidden text-xs text-muted-foreground max-md:block">
                  {qtyLabel}
                </span>
                {readOnly ? (
                  <span className="font-mono tabular-nums">
                    {formatNumber(line.qty || "0")}
                  </span>
                ) : (
                  <Input
                    aria-label={`${qtyLabel} ${line.product.name}`}
                    aria-invalid={invalid[line.key] === "qty"}
                    ref={(el) => {
                      if (el) qtyRefs.current.set(line.key, el);
                      else qtyRefs.current.delete(line.key);
                    }}
                    className="h-9 text-right font-mono tabular-nums"
                    inputMode="decimal"
                    value={line.qty}
                    onChange={(e) =>
                      onUpdate(line.key, { qty: e.target.value })
                    }
                    onBlur={(e) => onValidate(line.key, "qty", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onValidate(line.key, "qty", line.qty);
                        onCommit();
                      }
                    }}
                  />
                )}
              </td>
              {withCost && (
                <td className="px-3 py-1.5 text-right max-md:block max-md:px-0 max-md:py-0">
                  <span className="mb-1 hidden text-xs text-muted-foreground max-md:block">
                    {m.linegrid_col_cost()}
                  </span>
                  {readOnly ? (
                    <span className="font-mono tabular-nums">
                      {formatCurrency(line.cost || "0")}
                    </span>
                  ) : (
                    <Input
                      aria-label={`${m.linegrid_col_cost()} ${line.product.name}`}
                      aria-invalid={invalid[line.key] === "cost"}
                      className="h-9 text-right font-mono tabular-nums"
                      inputMode="decimal"
                      value={line.cost ?? ""}
                      onChange={(e) =>
                        onUpdate(line.key, { cost: e.target.value })
                      }
                      onBlur={(e) =>
                        onValidate(line.key, "cost", e.target.value)
                      }
                    />
                  )}
                </td>
              )}
              {withCost && (
                <td className="px-3 py-1.5 text-right font-mono tabular-nums max-md:flex max-md:justify-between max-md:px-0 max-md:py-0">
                  <span className="hidden text-xs font-sans text-muted-foreground max-md:block">
                    {m.linegrid_col_total()}
                  </span>
                  {formatCurrency(lineValue(line, signedQty))}
                </td>
              )}
              {!readOnly && (
                <td className="px-3 py-1.5 text-right max-md:hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.linegrid_remove()}
                    onClick={() => onRemove(line.key)}
                  >
                    <MinusIcon />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignToggle({
  line,
  onToggle,
}: {
  line: GridLine;
  onToggle: (line: GridLine) => void;
}) {
  const decrease = line.sign === -1;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 gap-1"
      aria-label={
        decrease ? m.linegrid_sign_decrease() : m.linegrid_sign_increase()
      }
      aria-pressed={decrease}
      onClick={() => onToggle(line)}
    >
      {decrease ? (
        <MinusIcon className="size-3.5" />
      ) : (
        <PlusIcon className="size-3.5" />
      )}
      {decrease ? m.linegrid_sign_decrease() : m.linegrid_sign_increase()}
    </Button>
  );
}
