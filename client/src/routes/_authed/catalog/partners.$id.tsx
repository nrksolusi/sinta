import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { defaultDetailColumns } from "@/components/catalog/detail-doc-columns";
import {
  PartnerForm,
  type PartnerFormValues,
} from "@/components/catalog/partner-form";
import { DocList, type DocRow } from "@/components/doc-list";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import type { Partner } from "@/lib/catalog";
import { warehousesQueryOptions } from "@/lib/catalog";
import { partnerDocRows } from "@/lib/entity-documents";
import { entityDocumentsQueryOptions } from "@/lib/entity-documents-query";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/catalog/partners/$id")({
  component: PartnerDetailPage,
});

async function invalidatePartners() {
  await queryClient.invalidateQueries({ queryKey: ["catalog-partners"] });
  await queryClient.invalidateQueries({ queryKey: ["partners"] });
}

function PartnerDetailPage() {
  const { id } = Route.useParams();
  const [editing, setEditing] = useState(false);

  const { data: partner, isLoading: partnerLoading } = useQuery({
    queryKey: ["catalog-partner", id],
    queryFn: async (): Promise<Partner | null> => {
      // No single-partner GET endpoint; resolve from the tenant-scoped list.
      const { data } = await api.GET("/partners", { params: { query: {} } });
      return data?.find((p) => p.id === id) ?? null;
    },
  });

  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const { data: sources, isLoading: docsLoading } = useQuery(
    entityDocumentsQueryOptions,
  );

  const warehouseCode = useMemo(() => {
    const byId = new Map(warehouses.map((w) => [w.id, w.code]));
    return (warehouseId: string) => byId.get(warehouseId) ?? warehouseId;
  }, [warehouses]);

  const rows = useMemo<DocRow[]>(() => {
    if (!sources) return [];
    return partnerDocRows(id, sources, {
      warehouseCode,
      label: {
        purchaseOrder: m.doctype_purchase_order(),
        goodsReceipt: m.doctype_goods_receipt(),
        salesOrder: m.doctype_sales_order(),
        delivery: m.doctype_delivery(),
      },
    });
  }, [id, sources, warehouseCode]);

  // The counterparty is this partner on every row, so that column shows the
  // document type instead.
  const columns = useMemo<ColumnDef<DocRow>[]>(
    () =>
      defaultDetailColumns().map((col) =>
        "accessorKey" in col && col.accessorKey === "counterparty"
          ? { ...col, header: m.partner_detail_doc_col_type() }
          : col,
      ),
    [],
  );

  const save = async (values: PartnerFormValues) => {
    if (!partner) return;
    const { response, data } = await api.PATCH("/partners/{partnerId}", {
      params: { path: { partnerId: partner.id } },
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
    await queryClient.invalidateQueries({ queryKey: ["catalog-partner", id] });
    await invalidatePartners();
  };

  if (!partner && !partnerLoading) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          variant="first-use"
          title={m.partner_detail_not_found()}
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
              {m.partner_detail_breadcrumb_catalog()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/catalog/partners">
              {m.partner_detail_breadcrumb_partners()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{partner?.code ?? partner?.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">
            {partner?.name}
          </h1>
          {partner?.code && (
            <span className="font-mono text-sm text-muted-foreground">
              {partner.code}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          {m.action_edit()}
        </Button>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{m.partner_detail_roles()}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {partner?.isSupplier && (
            <Badge variant="secondary">
              {m.partner_detail_role_supplier()}
            </Badge>
          )}
          {partner?.isCustomer && (
            <Badge variant="secondary">
              {m.partner_detail_role_customer()}
            </Badge>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          {m.partner_detail_documents_title()}
        </h2>
        <DocList
          docType="partner-documents"
          rows={rows}
          columns={columns}
          filters={{}}
          onFiltersChange={() => {}}
          // Document detail routes land in a later wave (F2.3/F2.4); rows are
          // read-only until those exist.
          onRowClick={() => {}}
          loading={docsLoading}
          emptyFirstUse={{
            title: m.partner_detail_docs_empty_title(),
            description: m.partner_detail_docs_empty_description(),
          }}
        />
      </section>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{m.partner_detail_edit()}</SheetTitle>
            <SheetDescription>{partner?.name}</SheetDescription>
          </SheetHeader>
          <div className="p-4 pt-0">
            {partner && (
              <PartnerForm
                partner={partner}
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
