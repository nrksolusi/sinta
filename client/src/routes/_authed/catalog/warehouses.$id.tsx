import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { defaultDetailColumns } from "@/components/catalog/detail-doc-columns";
import {
  WarehouseForm,
  type WarehouseFormValues,
} from "@/components/catalog/warehouse-form";
import { DataTable } from "@/components/data-table";
import { DocList, type DocRow } from "@/components/doc-list";
import { EmptyState } from "@/components/empty-state";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import type { Partner } from "@/lib/catalog";
import { partnersQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { warehouseDocRows } from "@/lib/entity-documents";
import { entityDocumentsQueryOptions } from "@/lib/entity-documents-query";
import { formatNumber } from "@/lib/format";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";

type StockOnHandRow = components["schemas"]["StockOnHandRow"];

export const Route = createFileRoute("/_authed/catalog/warehouses/$id")({
  component: WarehouseDetailPage,
});

async function invalidateWarehouses() {
  await queryClient.invalidateQueries({ queryKey: ["warehouses"] });
}

function WarehouseDetailPage() {
  const { id } = Route.useParams();
  const [editing, setEditing] = useState(false);

  const { data: warehouses = [], isLoading: warehouseLoading } = useQuery(
    warehousesQueryOptions,
  );
  const warehouse = warehouses.find((w) => w.id === id);

  const { data: stockRows = [], isLoading: stockLoading } = useQuery({
    queryKey: ["stock-on-hand", "warehouse", id],
    queryFn: async (): Promise<StockOnHandRow[]> => {
      const { data } = await api.GET("/reports/stock-on-hand", {
        params: { query: { warehouseId: id } },
      });
      return data?.rows ?? [];
    },
  });

  const { data: sources, isLoading: docsLoading } = useQuery(
    entityDocumentsQueryOptions,
  );
  // Partner names for the counterparty column; suppliers and customers.
  const { data: suppliers = [] } = useQuery(partnersQueryOptions("supplier"));
  const { data: customers = [] } = useQuery(partnersQueryOptions("customer"));

  const partnerName = useMemo(() => {
    const byId = new Map<string, string>();
    for (const p of [...suppliers, ...customers] as Partner[]) {
      byId.set(p.id, p.name);
    }
    return (partnerId: string) => byId.get(partnerId) ?? partnerId;
  }, [suppliers, customers]);

  const rows = useMemo<DocRow[]>(() => {
    if (!sources) return [];
    return warehouseDocRows(id, sources, {
      partnerName,
      label: {
        purchaseOrder: m.doctype_purchase_order(),
        goodsReceipt: m.doctype_goods_receipt(),
        salesOrder: m.doctype_sales_order(),
        delivery: m.doctype_delivery(),
      },
    });
  }, [id, sources, partnerName]);

  // The warehouse is this page's warehouse on every row, so that column shows
  // the document type instead.
  const docColumns = useMemo<ColumnDef<DocRow>[]>(
    () =>
      defaultDetailColumns().map((col) =>
        "accessorKey" in col && col.accessorKey === "warehouse"
          ? {
              ...col,
              header: m.warehouse_detail_doc_col_type(),
              cell: ({ row }) => <span>{row.original.warehouse}</span>,
            }
          : col,
      ),
    [],
  );

  const stockColumns = useMemo<ColumnDef<StockOnHandRow>[]>(
    () => [
      {
        accessorKey: "sku",
        header: m.warehouse_detail_stock_col_sku(),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono">{row.original.sku}</span>
        ),
      },
      {
        accessorKey: "productName",
        header: m.warehouse_detail_stock_col_product(),
        enableSorting: false,
      },
      {
        accessorKey: "batchNo",
        header: m.warehouse_detail_stock_col_batch(),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono">{row.original.batchNo ?? "-"}</span>
        ),
      },
      {
        accessorKey: "qtyOnHand",
        header: () => (
          <div className="text-right">{m.warehouse_detail_stock_col_qty()}</div>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatNumber(row.original.qtyOnHand)}
          </div>
        ),
      },
    ],
    [],
  );

  const save = async (values: WarehouseFormValues) => {
    if (!warehouse) return;
    const { response, data } = await api.PATCH("/warehouses/{warehouseId}", {
      params: { path: { warehouseId: warehouse.id } },
      body: values,
    });
    if (!data) {
      toast.error(
        response.status === 409 ? m.catalog_conflict() : m.error_generic(),
      );
      return;
    }
    toast.success(m.settings_saved());
    setEditing(false);
    await invalidateWarehouses();
  };

  if (!warehouse && !warehouseLoading) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          variant="first-use"
          title={m.warehouse_detail_not_found()}
          description=""
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/catalog/products">
              {m.warehouse_detail_breadcrumb_catalog()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/catalog/warehouses">
              {m.warehouse_detail_breadcrumb_warehouses()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">
              {warehouse?.code}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">
            {warehouse?.name}
          </h1>
          <span className="font-mono text-sm text-muted-foreground">
            {warehouse?.code}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          {m.action_edit()}
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          {m.warehouse_detail_stock_title()}
        </h2>
        {stockLoading ? (
          <div
            data-testid="stock-skeleton"
            className="flex flex-col gap-2"
            aria-busy="true"
          >
            {["s1", "s2", "s3", "s4"].map((k) => (
              <div key={k} className="h-11 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : stockRows.length === 0 ? (
          <Card size="sm">
            <CardContent>
              <EmptyState
                variant="first-use"
                title={m.warehouse_detail_stock_empty_title()}
                description={m.warehouse_detail_stock_empty_description()}
              />
            </CardContent>
          </Card>
        ) : (
          <DataTable
            columns={stockColumns}
            data={stockRows}
            getRowId={(r) => `${r.productId}-${r.batchId ?? "nobatch"}`}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          {m.warehouse_detail_documents_title()}
        </h2>
        <DocList
          docType="warehouse-documents"
          rows={rows}
          columns={docColumns}
          filters={{}}
          onFiltersChange={() => {}}
          // Document detail routes land in a later wave (F2.3/F2.4); rows are
          // read-only until those exist.
          onRowClick={() => {}}
          loading={docsLoading}
          emptyFirstUse={{
            title: m.warehouse_detail_docs_empty_title(),
            description: m.warehouse_detail_docs_empty_description(),
          }}
        />
      </section>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{m.warehouse_detail_edit()}</SheetTitle>
            <SheetDescription>{warehouse?.name}</SheetDescription>
          </SheetHeader>
          <div className="p-4 pt-0">
            {warehouse && (
              <WarehouseForm
                warehouse={warehouse}
                onSubmit={save}
                onCancel={() => setEditing(false)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
