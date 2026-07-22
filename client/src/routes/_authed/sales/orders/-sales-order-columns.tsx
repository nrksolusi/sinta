import type { ColumnDef } from "@tanstack/react-table";
import type { DocRow } from "@/components/doc-list";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages";

// Column set for the sales order list. It reproduces the DocList default columns
// (No./Tanggal/Pelanggan/Gudang/Total/Status) - which are private to the
// component - and appends the client-computed delivered-progress column, so the
// list stays a single DataTable without forking DocList (INC-4).
export function salesOrderColumns<
  TRow extends DocRow & { delivered: string },
>(): ColumnDef<TRow>[] {
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
      accessorKey: "delivered",
      header: m.so_col_delivered(),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.delivered}
        </span>
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
