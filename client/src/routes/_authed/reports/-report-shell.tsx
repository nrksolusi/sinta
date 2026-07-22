import type { ColumnDef } from "@tanstack/react-table";
import { DownloadIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";
import {
  activeReportFilters,
  type ReportFilters,
  useProductOptions,
  useWarehouseOptions,
} from "./-reports-data";

const SKELETON_ROWS = ["s1", "s2", "s3", "s4", "s5", "s6"];

// Shared frame for the stock reports (UX-D6, D10): filter bar (gudang + produk,
// state owned by the route's URL search params), a disabled M2 export slot,
// dense sticky-header DataTable, distinct first-use vs filtered empty states,
// and a row count. `footer` renders a totals bar under the table (valuation).
export interface ReportShellProps<TRow> {
  title: string;
  columns: ColumnDef<TRow>[];
  rows: TRow[];
  getRowId: (row: TRow) => string;
  loading: boolean;
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
  emptyFirstUseTitle: string;
  emptyFirstUseDescription: string;
  footer?: ReactNode;
}

export function ReportShell<TRow>({
  title,
  columns,
  rows,
  getRowId,
  loading,
  filters,
  onFiltersChange,
  emptyFirstUseTitle,
  emptyFirstUseDescription,
  footer,
}: ReportShellProps<TRow>) {
  const warehouseOptions = useWarehouseOptions();
  const productOptions = useProductOptions();
  const hasFilters = activeReportFilters(filters).length > 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {/* M2 export placeholder: disabled with an adjacent visible reason
            (UX-D10 - no disabled control without a caption). */}
        <div className="flex flex-col items-end gap-1">
          <Button variant="outline" size="sm" disabled>
            <DownloadIcon aria-hidden className="size-4" />
            {m.report_export()}
          </Button>
          <span className="text-xs text-muted-foreground">
            {m.report_export_hint()}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label
            id="report-filter-warehouse-label"
            htmlFor="report-filter-warehouse"
          >
            {m.report_filter_warehouse()}
          </Label>
          <SelectField
            id="report-filter-warehouse"
            aria-labelledby="report-filter-warehouse-label"
            size="sm"
            className="w-56"
            placeholder={m.report_filter_warehouse_all()}
            options={warehouseOptions}
            value={filters.warehouseId}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, warehouseId: value ?? undefined })
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label
            id="report-filter-product-label"
            htmlFor="report-filter-product"
          >
            {m.report_filter_product()}
          </Label>
          <SelectField
            id="report-filter-product"
            aria-labelledby="report-filter-product-label"
            size="sm"
            className="w-56"
            placeholder={m.report_filter_product_all()}
            options={productOptions}
            value={filters.productId}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, productId: value ?? undefined })
            }
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => onFiltersChange({})}>
            {m.report_reset_filters()}
          </Button>
        )}
      </div>

      {loading ? (
        <div
          data-testid="report-skeleton"
          className="flex flex-col gap-2"
          aria-busy="true"
        >
          {SKELETON_ROWS.map((rowKey) => (
            <Skeleton key={rowKey} className="h-11" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            variant="filtered"
            title={m.report_empty_filtered_title()}
            description={m.report_empty_filtered_description()}
            action={
              <button
                type="button"
                className="text-sm underline underline-offset-4"
                onClick={() => onFiltersChange({})}
              >
                {m.report_reset_filters()}
              </button>
            }
          />
        ) : (
          <EmptyState
            variant="first-use"
            title={emptyFirstUseTitle}
            description={emptyFirstUseDescription}
          />
        )
      ) : (
        <>
          {/* Sticky header + max height keeps the header visible while the body
              scrolls; alignment/mono is applied per-column in the cell/header
              renderers (UX-D10 table house rules). */}
          <div className="max-h-[70vh] overflow-auto rounded-md border [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-background">
            <DataTable columns={columns} data={rows} getRowId={getRowId} />
          </div>
          {footer}
          <p className="text-xs text-muted-foreground tabular-nums">
            {m.report_count({ count: rows.length })}
          </p>
        </>
      )}
    </section>
  );
}
