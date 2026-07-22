import type { ColumnDef } from "@tanstack/react-table";
import { XIcon } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { type DocumentStatus, StatusBadge } from "./status-badge";

// The row shape every document list shares. Drafts carry `number: null` (a doc
// number is assigned only at posting) and often `total: null`. Money/qty arrive
// as numeric strings; they render through format.ts.
export interface DocRow {
  id: string;
  number: string | null;
  date: string | number | Date;
  counterparty: string;
  warehouse: string;
  total: string | number | null;
  status: DocumentStatus;
}

// Controlled filter state. NOTE: URL-search-param wiring (shareable, survives
// back-nav per UX-D10) is the consuming route's job - DocList takes this state
// controlled via `filters` / `onFiltersChange` and never reads or writes the
// URL itself.
export interface DocListFilters {
  status?: string;
  dateRange?: string;
  warehouse?: string;
}

export interface DocListProps<TRow extends DocRow = DocRow> {
  docType: string;
  rows: TRow[];
  // Per-type override; defaults to No./Tanggal/counterparty/Gudang/Total/Status.
  columns?: ColumnDef<TRow>[];
  filters: DocListFilters;
  onFiltersChange: (filters: DocListFilters) => void;
  onRowClick: (row: TRow) => void;
  loading?: boolean;
  // Distinct copy for the first-use empty state (no data ever).
  emptyFirstUse?: {
    title?: string;
    description?: string;
    action?: React.ReactNode;
  };
}

const SKELETON_ROWS = ["s1", "s2", "s3", "s4", "s5", "s6"];

// Drafts sort first, then newest date (UX-D10 / prototype D1).
function sortDocs<TRow extends DocRow>(rows: TRow[]): TRow[] {
  return [...rows].sort((a, b) => {
    const aDraft = a.status === "draft" ? 0 : 1;
    const bDraft = b.status === "draft" ? 0 : 1;
    if (aDraft !== bDraft) return aDraft - bDraft;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

function defaultColumns<TRow extends DocRow>(): ColumnDef<TRow>[] {
  return [
    {
      accessorKey: "number",
      header: m.doclist_col_no(),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">
          {row.original.number ?? m.status_draft()}
        </span>
      ),
    },
    {
      accessorKey: "date",
      header: m.doclist_col_date(),
      enableSorting: false,
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      accessorKey: "counterparty",
      header: m.doclist_col_counterparty(),
      enableSorting: false,
    },
    {
      accessorKey: "warehouse",
      header: m.doclist_col_warehouse(),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono">{row.original.warehouse}</span>
      ),
    },
    {
      accessorKey: "total",
      header: () => <div className="text-right">{m.doclist_col_total()}</div>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          {row.original.total == null
            ? "-"
            : formatCurrency(row.original.total)}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: m.doclist_col_status(),
      enableSorting: false,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
}

// Which filters carry a value; drives empty-state variant and the chip bar.
function activeFilters(filters: DocListFilters): (keyof DocListFilters)[] {
  return (Object.keys(filters) as (keyof DocListFilters)[]).filter(
    (key) => filters[key] != null && filters[key] !== "",
  );
}

const FILTER_CHIP_LABEL: Record<
  keyof DocListFilters,
  (value: string) => string
> = {
  status: (value) => m.doclist_filter_status({ value }),
  dateRange: (value) => m.doclist_filter_date({ value }),
  warehouse: (value) => m.doclist_filter_warehouse({ value }),
};

function FilterChips({
  filters,
  onFiltersChange,
}: {
  filters: DocListFilters;
  onFiltersChange: (filters: DocListFilters) => void;
}) {
  const active = activeFilters(filters);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((key) => (
        <Badge key={key} variant="outline" className="gap-1">
          {FILTER_CHIP_LABEL[key](String(filters[key]))}
          <button
            type="button"
            aria-label={m.doclist_filter_remove()}
            className="-mr-1 inline-flex items-center rounded-full p-0.5 hover:bg-muted"
            onClick={() => {
              const next = { ...filters };
              delete next[key];
              onFiltersChange(next);
            }}
          >
            <XIcon aria-hidden className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

// Thin preset over DataTable for document lists (UX-D10, prototype D1).
export function DocList<TRow extends DocRow = DocRow>({
  rows,
  columns,
  filters,
  onFiltersChange,
  onRowClick,
  loading = false,
  emptyFirstUse,
}: DocListProps<TRow>) {
  const sorted = useMemo(() => sortDocs(rows), [rows]);
  const cols = columns ?? defaultColumns<TRow>();
  const hasFilters = activeFilters(filters).length > 0;

  const clickableColumns = useMemo<ColumnDef<TRow>[]>(
    () =>
      cols.map((col) => {
        const base = col.cell;
        return {
          ...col,
          cell: (ctx) => (
            <button
              type="button"
              className="block w-full cursor-pointer text-left"
              onClick={() => onRowClick(ctx.row.original)}
            >
              {base
                ? typeof base === "function"
                  ? base(ctx)
                  : ctx.getValue<React.ReactNode>()
                : ctx.getValue<React.ReactNode>()}
            </button>
          ),
        } as ColumnDef<TRow>;
      }),
    [cols, onRowClick],
  );

  return (
    <div className="flex flex-col gap-3">
      <FilterChips filters={filters} onFiltersChange={onFiltersChange} />

      {loading ? (
        <div
          data-testid="doc-list-skeleton"
          className="flex flex-col gap-2"
          aria-busy="true"
        >
          {SKELETON_ROWS.map((rowKey) => (
            <div
              key={rowKey}
              className="h-11 animate-pulse rounded-md bg-muted"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        hasFilters ? (
          <EmptyState
            variant="filtered"
            title={m.doclist_empty_filtered_title()}
            description={m.doclist_empty_filtered_description()}
            action={
              <button
                type="button"
                className="text-sm underline underline-offset-4"
                onClick={() => onFiltersChange({})}
              >
                {m.doclist_reset_filters()}
              </button>
            }
          />
        ) : (
          <EmptyState
            variant="first-use"
            title={emptyFirstUse?.title ?? m.doclist_empty_first_use_title()}
            description={
              emptyFirstUse?.description ??
              m.doclist_empty_first_use_description()
            }
            action={emptyFirstUse?.action}
          />
        )
      ) : (
        <>
          <DataTable
            columns={clickableColumns}
            data={sorted}
            getRowId={(row) => row.id}
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {m.doclist_count({ count: sorted.length })}
          </p>
        </>
      )}
    </div>
  );
}
