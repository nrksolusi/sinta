import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import {
  DocList,
  type DocListFilters,
  type DocRow,
} from "@/components/doc-list";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { warehousesQueryOptions } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { badgeStatus, opnamesQueryOptions } from "./-opname-data";

// Opname list rows carry the line count (opnames have no counterparty/total).
interface OpnameRow extends DocRow {
  lineCount: number;
}

// Filter state lives in the URL (shareable, survives back-nav per UX-D10).
export const Route = createFileRoute("/_authed/stock/opnames/")({
  validateSearch: (search: Record<string, unknown>): DocListFilters => ({
    status: typeof search.status === "string" ? search.status : undefined,
    warehouse:
      typeof search.warehouse === "string" ? search.warehouse : undefined,
  }),
  component: OpnameListPage,
});

function OpnameListPage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data: opnames = [], isPending } = useQuery(opnamesQueryOptions);
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);

  const warehouseCode = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w.code])),
    [warehouses],
  );

  const rows = useMemo<OpnameRow[]>(() => {
    const filtered = opnames.filter((o) => {
      if (filters.status && o.status !== filters.status) return false;
      if (filters.warehouse && o.warehouseId !== filters.warehouse)
        return false;
      return true;
    });
    return filtered.map((o) => ({
      id: o.id,
      number: o.docNumber ?? null,
      date: o.docDate,
      counterparty: "",
      warehouse: warehouseCode.get(o.warehouseId) ?? "",
      total: null,
      status: badgeStatus(o.status),
      lineCount: o.lines.length,
    }));
  }, [opnames, filters, warehouseCode]);

  const columns = useMemo<ColumnDef<OpnameRow>[]>(
    () => [
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
        accessorKey: "warehouse",
        header: m.field_warehouse(),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono">{row.original.warehouse}</span>
        ),
      },
      {
        accessorKey: "lineCount",
        header: () => <div className="text-right">{m.opname_col_lines()}</div>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {row.original.lineCount}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: m.doclist_col_status(),
        enableSorting: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {m.opname_breadcrumb_list()}
        </h1>
        <Button onClick={() => navigate({ to: "/stock/opnames/new" })}>
          {m.opname_list_new()}
        </Button>
      </div>

      <DocList<OpnameRow>
        docType="opname"
        rows={rows}
        columns={columns}
        filters={filters}
        onFiltersChange={(next) => navigate({ search: next as DocListFilters })}
        onRowClick={(row) =>
          navigate({ to: "/stock/opnames/$id", params: { id: row.id } })
        }
        loading={isPending}
        emptyFirstUse={{
          title: m.opname_empty_first_use_title(),
          description: m.opname_empty_first_use_description(),
          action: (
            <Button onClick={() => navigate({ to: "/stock/opnames/new" })}>
              {m.opname_list_new()}
            </Button>
          ),
        }}
      />
    </main>
  );
}
