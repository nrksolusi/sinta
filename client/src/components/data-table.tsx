import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Fragment, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  // Inline edit: when a row's id matches, an expansion row is rendered beneath
  // it spanning the full width, holding renderExpandedRow's content.
  expandedRowId?: string | null;
  renderExpandedRow?: (row: TData) => React.ReactNode;
}

// Thin wrapper over TanStack Table + shadcn Table shared by the list screens.
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  expandedRowId,
  renderExpandedRow,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const content = header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  );
              const sorted = header.column.getIsSorted();
              return (
                <TableHead key={header.id}>
                  {header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground/80"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {content}
                      {sorted === "asc" ? (
                        <ArrowUp aria-hidden className="size-3.5" />
                      ) : sorted === "desc" ? (
                        <ArrowDown aria-hidden className="size-3.5" />
                      ) : (
                        <ChevronsUpDown
                          aria-hidden
                          className="size-3.5 text-muted-foreground"
                        />
                      )}
                    </button>
                  ) : (
                    content
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => {
          const expanded = expandedRowId === row.id;
          return (
            <Fragment key={row.id}>
              <TableRow aria-expanded={expanded || undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              {expanded && renderExpandedRow && (
                <TableRow>
                  <TableCell colSpan={row.getVisibleCells().length}>
                    {renderExpandedRow(row.original)}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
