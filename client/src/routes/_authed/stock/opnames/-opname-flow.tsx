import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ScanLineIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ProductCombobox } from "@/components/product-combobox";
import { ScannerDialog } from "@/components/scanner-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WarehouseCombobox } from "@/components/warehouse-combobox";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { productsQueryOptions } from "@/lib/catalog";
import { formatCurrency, formatNumber } from "@/lib/format";
import { pickerWarehousesQueryOptions } from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";
import { productFactsById } from "./-opname-data";
import {
  appendOffSheetRow,
  buildSheet,
  computeReview,
  countedLines,
  type SheetRow,
  toLineInput,
} from "./-opname-sheet";

type Product = components["schemas"]["Product"];
type StockOnHandRow = components["schemas"]["StockOnHandRow"];
type StockValuationRow = components["schemas"]["StockValuationRow"];

type Step = "setup" | "count" | "review";
type Mode = "show" | "blind";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface OpnameFlowInitial {
  // A resumed draft. When absent the flow starts empty at step 1.
  opnameId?: string;
  warehouseId?: string;
  docDate?: string;
  notes?: string;
  sheet?: SheetRow[];
  step?: Step;
}

// The three-step count-sheet flow (prototype D5 / UX-D3) in one component, used
// by both /stock/opnames/new and the draft-resume path of the detail page. Step
// state is internal; the domain logic lives in -opname-sheet.ts.
export function OpnameFlow({ initial }: { initial?: OpnameFlowInitial }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(initial?.step ?? "setup");
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? "");
  const [docDate, setDocDate] = useState(initial?.docDate ?? today());
  const [notes] = useState(initial?.notes ?? "");
  const [mode, setMode] = useState<Mode>("show");
  const [sheet, setSheet] = useState<SheetRow[]>(initial?.sheet ?? []);
  const [opnameId, setOpnameId] = useState<string | undefined>(
    initial?.opnameId,
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [flashKey, setFlashKey] = useState<string | null>(null);

  const { data: products = [] } = useQuery(productsQueryOptions);
  const { data: warehouses = [] } = useQuery(pickerWarehousesQueryOptions);
  const productFacts = useMemo(() => productFactsById(products), [products]);
  const warehouseName = useMemo(
    () => warehouses.find((w) => w.id === warehouseId)?.code ?? "",
    [warehouses, warehouseId],
  );

  // Fetch the warehouse's stock-on-hand only when building the sheet (step 1
  // action), not on every keystroke; done imperatively in buildSheetNow.
  const buildSheetNow = async () => {
    const { data } = await api.GET("/reports/stock-on-hand", {
      params: { query: { warehouseId } },
    });
    const rows: StockOnHandRow[] = data?.rows ?? [];
    setSheet(buildSheet(rows, productFacts));
    setStep("count");
  };

  const blind = mode === "blind";

  // --- Step 2 helpers ------------------------------------------------------
  const setCount = (key: string, raw: string) => {
    setSheet((prev) =>
      prev.map((r) =>
        r.key === key
          ? { ...r, countedQty: raw === "" ? null : Number(raw) }
          : r,
      ),
    );
  };

  const resolveProduct = (product: Product) => {
    const { sheet: next, key, appended } = appendOffSheetRow(sheet, product);
    setSheet(next);
    if (appended) toast.success(m.opname_row_appended({ name: product.name }));
    setFlashKey(key);
    // Focus the matching row's input on the next paint.
    requestAnimationFrame(() => {
      document.getElementById(`opname-count-${key}`)?.focus();
      window.setTimeout(() => setFlashKey(null), 800);
    });
  };

  const resolveBarcode = (barcode: string) => {
    const match = products.find(
      (p) => p.barcode === barcode || p.sku === barcode,
    );
    if (match) resolveProduct(match);
    else toast.error(m.opname_scan_no_match({ barcode }));
  };

  // --- Persistence ---------------------------------------------------------
  const buildBody = () => ({
    warehouseId,
    docDate,
    notes: notes || undefined,
    lines: countedLines(sheet).map(toLineInput),
  });

  const saveDraft = useMutation({
    mutationFn: async () => {
      const body = buildBody();
      if (opnameId) {
        const { data } = await api.PUT("/stock-opnames/{id}", {
          params: { path: { id: opnameId } },
          body,
        });
        return data;
      }
      const { data } = await api.POST("/stock-opnames", { body });
      return data;
    },
    onSuccess: (data) => {
      if (data) setOpnameId(data.id);
      queryClient.invalidateQueries({ queryKey: ["stock-opnames"] });
      toast.success(m.opname_saved_draft());
    },
    onError: () => toast.error(m.doc_create_failed()),
  });

  const postOpname = useMutation({
    mutationFn: async () => {
      // Ensure a draft exists (create or update) before posting.
      const body = buildBody();
      let id = opnameId;
      if (id) {
        await api.PUT("/stock-opnames/{id}", {
          params: { path: { id } },
          body,
        });
      } else {
        const { data } = await api.POST("/stock-opnames", { body });
        if (!data) throw new Error("create failed");
        id = data.id;
        setOpnameId(id);
      }
      const { data: posted } = await api.POST("/stock-opnames/{id}/post", {
        params: { path: { id } },
      });
      if (!posted) throw new Error("post failed");
      return posted;
    },
    onSuccess: (posted) => {
      queryClient.invalidateQueries({ queryKey: ["stock-opnames"] });
      toast.success(m.doc_posted({ number: posted.docNumber ?? "" }));
      router.navigate({
        to: "/stock/opnames/$id",
        params: { id: posted.id },
      });
    },
    onError: () => {
      setConfirmOpen(false);
      toast.error(m.doc_post_failed());
    },
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.opname_new()}
        </h1>
        <StepIndicator step={step} />
      </div>

      {step === "setup" && (
        <SetupStep
          warehouseId={warehouseId}
          onWarehouse={setWarehouseId}
          docDate={docDate}
          onDocDate={setDocDate}
          mode={mode}
          onMode={setMode}
          onBuild={buildSheetNow}
        />
      )}

      {step === "count" && (
        <CountStep
          sheet={sheet}
          blind={blind}
          warehouseId={warehouseId}
          flashKey={flashKey}
          onCount={setCount}
          onPick={resolveProduct}
          onOpenScanner={() => setScannerOpen(true)}
          onBack={() => setStep("setup")}
          onSaveDraft={() => saveDraft.mutate()}
          saving={saveDraft.isPending}
          onNext={() => setStep("review")}
        />
      )}

      {step === "review" && (
        <ReviewStep
          sheet={sheet}
          warehouseId={warehouseId}
          onSheet={setSheet}
          onBack={() => setStep("count")}
          onPost={() => setConfirmOpen(true)}
        />
      )}

      <ScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={resolveBarcode}
      />

      <PostConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        sheet={sheet}
        warehouseId={warehouseId}
        warehouseCode={warehouseName}
        pending={postOpname.isPending}
        onConfirm={() => postOpname.mutate()}
      />
    </main>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const order: Step[] = ["setup", "count", "review"];
  const current = order.indexOf(step) + 1;
  const label = {
    setup: m.opname_step_setup(),
    count: m.opname_step_count(),
    review: m.opname_step_review(),
  }[step];
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {m.opname_step_of({ current, total: 3 })} - {label}
    </span>
  );
}

function SetupStep({
  warehouseId,
  onWarehouse,
  docDate,
  onDocDate,
  mode,
  onMode,
  onBuild,
}: {
  warehouseId: string;
  onWarehouse: (id: string) => void;
  docDate: string;
  onDocDate: (v: string) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  onBuild: () => void;
}) {
  return (
    <section className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label id="opname-warehouse-label">{m.field_warehouse()}</Label>
        <WarehouseCombobox
          value={warehouseId || undefined}
          onSelect={(w) => onWarehouse(w.id)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="opname-doc-date">{m.field_doc_date()}</Label>
        <Input
          id="opname-doc-date"
          type="date"
          value={docDate}
          onChange={(e) => onDocDate(e.target.value)}
          className="w-48"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          {m.opname_mode_label()}
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="opname-mode"
            value="show"
            checked={mode === "show"}
            onChange={() => onMode("show")}
          />
          {m.opname_mode_show_system()}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="opname-mode"
            value="blind"
            checked={mode === "blind"}
            onChange={() => onMode("blind")}
          />
          {m.opname_mode_blind()}
        </label>
        {mode === "blind" && (
          <p className="text-xs text-muted-foreground">
            {m.opname_mode_blind_hint()}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col items-start gap-1">
        <Button onClick={onBuild} disabled={!warehouseId}>
          {m.opname_build_sheet()}
        </Button>
        {!warehouseId && (
          <span className="text-xs text-muted-foreground">
            {m.opname_build_sheet_hint()}
          </span>
        )}
      </div>
    </section>
  );
}

export function CountStep({
  sheet,
  blind,
  warehouseId,
  flashKey,
  onCount,
  onPick,
  onOpenScanner,
  onBack,
  onSaveDraft,
  saving,
  onNext,
}: {
  sheet: SheetRow[];
  blind: boolean;
  warehouseId: string;
  flashKey: string | null;
  onCount: (key: string, raw: string) => void;
  onPick: (p: Product) => void;
  onOpenScanner: () => void;
  onBack: () => void;
  onSaveDraft: () => void;
  saving: boolean;
  onNext: () => void;
}) {
  const countedCount = sheet.filter((r) => r.countedQty !== null).length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <ProductCombobox warehouseId={warehouseId} onSelect={onPick} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={m.opname_scan()}
          onClick={onOpenScanner}
        >
          <ScanLineIcon aria-hidden className="size-4" />
        </Button>
      </div>

      {sheet.length === 0 ? (
        <EmptyState
          variant="first-use"
          title={m.opname_sheet()}
          description={m.opname_sheet_empty()}
        />
      ) : (
        <div className="max-h-[60vh] overflow-auto rounded-md border [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.opname_col_product()}</TableHead>
                {!blind && (
                  <TableHead className="text-right">
                    {m.opname_col_system()}
                  </TableHead>
                )}
                <TableHead className="text-right">
                  {m.opname_col_physical()}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.map((row) => (
                <TableRow
                  key={row.key}
                  data-flash={flashKey === row.key || undefined}
                  className={flashKey === row.key ? "bg-accent/60" : undefined}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{row.productName}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.sku}
                        {row.batchNo ? ` - ${row.batchNo}` : ""}
                        {row.offSheet ? ` - ${m.opname_off_sheet()}` : ""}
                      </span>
                    </div>
                  </TableCell>
                  {!blind && (
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatNumber(row.systemQty)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <Input
                        id={`opname-count-${row.key}`}
                        inputMode="decimal"
                        aria-label={`${m.opname_col_physical()} ${row.productName}`}
                        value={row.countedQty ?? ""}
                        onChange={(e) => onCount(row.key, e.target.value)}
                        className="w-28 text-right font-mono tabular-nums"
                      />
                      {row.countedQty === null && (
                        <span className="text-xs text-warning-foreground">
                          {m.opname_uncounted()}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-background py-3">
        <Button variant="ghost" onClick={onBack}>
          {m.opname_back()}
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatNumber(countedCount)} / {formatNumber(sheet.length)}
          </span>
          <Button variant="outline" onClick={onSaveDraft} disabled={saving}>
            {m.opname_save_draft()}
          </Button>
          <Button onClick={onNext} disabled={countedCount === 0}>
            {m.opname_next()}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ReviewStep({
  sheet,
  warehouseId,
  onSheet,
  onBack,
  onPost,
}: {
  sheet: SheetRow[];
  warehouseId: string;
  onSheet: (s: SheetRow[]) => void;
  onBack: () => void;
  onPost: () => void;
}) {
  const { data: valuation = [] } = useQuery({
    queryKey: ["stock-valuation", warehouseId],
    queryFn: async (): Promise<StockValuationRow[]> => {
      const { data } = await api.GET("/reports/stock-valuation", {
        params: { query: { warehouseId } },
      });
      return data?.rows ?? [];
    },
  });

  const review = useMemo(
    () => computeReview(sheet, valuation),
    [sheet, valuation],
  );

  // Bulk actions operate on the uncounted rows: fill each to its system qty, or
  // count each explicitly as zero. Both make the skip an intentional choice.
  const fillUncountedToSystem = () =>
    onSheet(
      sheet.map((r) =>
        r.countedQty === null ? { ...r, countedQty: r.systemQty } : r,
      ),
    );
  const zeroUncounted = () =>
    onSheet(
      sheet.map((r) => (r.countedQty === null ? { ...r, countedQty: 0 } : r)),
    );

  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {m.opname_review_estimate_note()}
      </p>

      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.opname_col_product()}</TableHead>
              <TableHead className="text-right">
                {m.opname_col_system()}
              </TableHead>
              <TableHead className="text-right">
                {m.opname_col_physical()}
              </TableHead>
              <TableHead className="text-right">
                {m.opname_col_variance()}
              </TableHead>
              <TableHead className="text-right">
                {m.opname_col_value()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {review.counted.map((line) => (
              <TableRow key={line.key}>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{line.productName}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {line.sku}
                      {line.batchNo ? ` - ${line.batchNo}` : ""}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumber(line.systemQty)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumber(line.countedQty)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${
                    line.variance < 0
                      ? "text-destructive"
                      : line.variance > 0
                        ? "text-success"
                        : ""
                  }`}
                >
                  {line.variance > 0 ? "+" : ""}
                  {formatNumber(line.variance)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatCurrency(line.valueEstimate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm font-medium tabular-nums">
        {m.opname_review_variance_summary({
          count: review.varianceLineCount,
          value: formatCurrency(review.totalValueEstimate),
        })}
      </p>

      {review.uncounted.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">
              {m.opname_review_uncounted_title()} (
              {formatNumber(review.uncounted.length)})
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fillUncountedToSystem}
              >
                {m.opname_bulk_fill_system()}
              </Button>
              <Button variant="outline" size="sm" onClick={zeroUncounted}>
                {m.opname_bulk_zero()}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {m.opname_review_uncounted_hint()}
          </p>
          <ul className="flex flex-col gap-0.5 text-sm">
            {review.uncounted.map((u) => (
              <li key={u.key} className="flex items-baseline gap-2">
                <span>{u.productName}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {u.sku}
                  {u.batchNo ? ` - ${u.batchNo}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-background py-3">
        <Button variant="ghost" onClick={onBack}>
          {m.opname_back()}
        </Button>
        <Button onClick={onPost} disabled={review.counted.length === 0}>
          {m.opname_post()}
        </Button>
      </div>
    </section>
  );
}

function PostConfirm({
  open,
  onOpenChange,
  sheet,
  warehouseId,
  warehouseCode,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheet: SheetRow[];
  warehouseId: string;
  warehouseCode: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const { data: valuation = [] } = useQuery({
    queryKey: ["stock-valuation", warehouseId],
    queryFn: async (): Promise<StockValuationRow[]> => {
      const { data } = await api.GET("/reports/stock-valuation", {
        params: { query: { warehouseId } },
      });
      return data?.rows ?? [];
    },
    enabled: open,
  });
  const review = computeReview(sheet, valuation);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={m.opname_post_confirm_title()}
      specifics={m.opname_post_confirm_specifics({
        warehouse: warehouseCode,
        count: review.varianceLineCount,
      })}
      confirmLabel={m.opname_post()}
      onConfirm={onConfirm}
      pending={pending}
    />
  );
}
