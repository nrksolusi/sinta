import type { ColumnDef } from "@tanstack/react-table";
import type { DocRow } from "@/components/doc-list";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages";

// Column set for an entity detail's document list. The "counterparty" column is
// relabelled per page (document type on partner pages, partner name on
// warehouse pages) by the caller; the accessor keys stay stable so DocList's
// row-click plumbing keeps working.
export function defaultDetailColumns(): ColumnDef<DocRow>[] {
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
      accessorKey: "status",
      header: m.doclist_col_status(),
      enableSorting: false,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
}
