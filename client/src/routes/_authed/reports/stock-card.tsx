import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { DownloadIcon } from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ProductCombobox } from "@/components/product-combobox";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { useWarehouseOptions } from "./-reports-data";
import {
  docHref,
  type StockCardEntry,
  signedQty,
  sortEntriesNewestFirst,
} from "./-stock-card-data";

const SKELETON_ROWS = ["s1", "s2", "s3", "s4", "s5", "s6"];

const MOVEMENT_LABEL: Record<StockCardEntry["movementType"], () => string> = {
  receipt: () => m.movement_receipt(),
  issue: () => m.movement_issue(),
  transfer_in: () => m.movement_transfer_in(),
  transfer_out: () => m.movement_transfer_out(),
  adjustment: () => m.movement_adjustment(),
  opname: () => m.movement_opname(),
  cost_correction: () => m.movement_cost_correction(),
  revaluation: () => m.movement_revaluation(),
};

interface StockCardFilters {
  productId?: string;
  warehouseId?: string;
}

// Filter state lives in the URL (shareable, survives back-nav per UX-D10),
// mirroring stock-on-hand.tsx. Unlike the other reports, Produk is required -
// the API needs a productId - so the empty state prompts for one first.
export const Route = createFileRoute("/_authed/reports/stock-card")({
  validateSearch: (search: Record<string, unknown>): StockCardFilters => ({
    productId:
      typeof search.productId === "string" ? search.productId : undefined,
    warehouseId:
      typeof search.warehouseId === "string" ? search.warehouseId : undefined,
  }),
  component: StockCardPage,
});

function StockCardPage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();

  const warehouseOptions = useWarehouseOptions();

  const { data, isPending } = useQuery({
    queryKey: ["report-stock-card", filters.productId, filters.warehouseId],
    // Guarded by `enabled`: no query fires until a product is picked, so
    // `productId` is always present when this runs.
    queryFn: async () => {
      const { data } = await api.GET("/reports/stock-card", {
        params: {
          query: {
            productId: filters.productId as string,
            warehouseId: filters.warehouseId,
          },
        },
      });
      return sortEntriesNewestFirst(data?.entries ?? []);
    },
    enabled: Boolean(filters.productId),
  });

  const columns = useMemo<ColumnDef<StockCardEntry>[]>(
    () => [
      {
        accessorKey: "effectiveAt",
        header: m.stockcard_col_date(),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDate(row.original.effectiveAt)}
          </span>
        ),
      },
      {
        id: "doc",
        header: m.stockcard_col_doc(),
        cell: ({ row }) => {
          const href = docHref(row.original.docType, row.original.docId);
          const label = MOVEMENT_LABEL[row.original.movementType]();
          return href ? (
            <a
              href={href}
              className="font-mono text-sm underline underline-offset-4 hover:text-foreground"
            >
              {label}
            </a>
          ) : (
            <span className="font-mono text-sm">{label}</span>
          );
        },
      },
      {
        id: "jenis",
        header: m.stockcard_col_type(),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            {MOVEMENT_LABEL[row.original.movementType]()}
            {/* Provisional = movement valued below zero stock (D6). Flagged
                with the amber --warning treatment so it stands out in the
                audit trail. */}
            {row.original.provisional && (
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning-foreground">
                {m.stockcard_provisional()}
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "qty",
        header: () => <div className="text-right">{m.stockcard_col_qty()}</div>,
        cell: ({ row }) => (
          <div
            className={cn(
              "text-right font-mono tabular-nums",
              row.original.provisional && "text-warning-foreground",
            )}
          >
            {signedQty(row.original.qty)}
          </div>
        ),
      },
      {
        accessorKey: "runningQty",
        header: () => (
          <div className="text-right">{m.stockcard_col_balance()}</div>
        ),
        cell: ({ row }) => (
          <div
            className={cn(
              "text-right font-mono tabular-nums",
              row.original.provisional && "text-warning-foreground",
            )}
          >
            {formatNumber(row.original.runningQty)}
          </div>
        ),
      },
      {
        accessorKey: "runningValue",
        header: () => (
          <div className="text-right">{m.stockcard_col_value()}</div>
        ),
        cell: ({ row }) => (
          <div
            className={cn(
              "text-right font-mono tabular-nums",
              row.original.provisional && "text-warning-foreground",
            )}
          >
            {formatCurrency(row.original.runningValue)}
          </div>
        ),
      },
    ],
    [],
  );

  const rows = data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {m.stockcard_title()}
        </h2>
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
          {/* The combobox trigger carries its own aria-label (the search
              placeholder), so the visible caption sits above it without an
              htmlFor/id association. */}
          <Label>{m.report_filter_product()}</Label>
          <div className="w-64">
            <ProductCombobox
              value={filters.productId}
              warehouseId={filters.warehouseId}
              onSelect={(product) =>
                navigate({ search: { ...filters, productId: product.id } })
              }
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label
            id="stock-card-filter-warehouse-label"
            htmlFor="stock-card-filter-warehouse"
          >
            {m.report_filter_warehouse()}
          </Label>
          <SelectField
            id="stock-card-filter-warehouse"
            aria-labelledby="stock-card-filter-warehouse-label"
            size="sm"
            className="w-56"
            placeholder={m.report_filter_warehouse_all()}
            options={warehouseOptions}
            value={filters.warehouseId}
            onValueChange={(value) =>
              navigate({
                search: { ...filters, warehouseId: value ?? undefined },
              })
            }
          />
        </div>
      </div>

      {!filters.productId ? (
        <EmptyState
          variant="first-use"
          title={m.stockcard_empty_no_product_title()}
          description={m.stockcard_empty_no_product_description()}
        />
      ) : isPending ? (
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
        <EmptyState
          variant="filtered"
          title={m.stockcard_empty_no_movements_title()}
          description={m.stockcard_empty_no_movements_description()}
        />
      ) : (
        <>
          {/* Sticky header + max height keeps the header visible while the body
              scrolls; provisional entries carry the amber --warning treatment
              per-cell (UX-D6). */}
          <div className="max-h-[70vh] overflow-auto rounded-md border [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-background">
            <DataTable
              columns={columns}
              data={rows}
              getRowId={(row) => row.movementId}
            />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {m.report_count({ count: rows.length })}
          </p>
        </>
      )}
    </section>
  );
}
