import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  KartuStokTable,
  ProductStockTable,
  ProductSummaryCard,
} from "@/components/catalog/product-detail";
import {
  ProductForm,
  type ProductPayload,
} from "@/components/catalog/product-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Product } from "@/lib/catalog";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/catalog/products/$id")({
  component: ProductDetailPage,
});

// The list caches active products under both keys (this page's own list and the
// warehouse screens' ["products"]); keep them fresh after any mutation here.
async function invalidateProducts(productId: string) {
  await queryClient.invalidateQueries({ queryKey: ["catalog-products"] });
  await queryClient.invalidateQueries({ queryKey: ["products"] });
  await queryClient.invalidateQueries({ queryKey: ["product", productId] });
}

function ProductDetailPage() {
  const { id } = Route.useParams();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const productQuery = useQuery({
    queryKey: ["product", id],
    queryFn: async (): Promise<Product | null> => {
      const { data } = await api.GET("/products/{productId}", {
        params: { path: { productId: id } },
      });
      return data ?? null;
    },
  });
  const product = productQuery.data ?? null;

  const uomsQuery = useQuery({
    queryKey: ["product-uoms", id],
    queryFn: async () => {
      const { data } = await api.GET("/products/{productId}/uoms", {
        params: { path: { productId: id } },
      });
      return data ?? [];
    },
  });

  const batchesQuery = useQuery({
    queryKey: ["product-batches", id],
    enabled: product?.isBatchTracked ?? false,
    queryFn: async () => {
      const { data } = await api.GET("/products/{productId}/batches", {
        params: { path: { productId: id } },
      });
      return data ?? [];
    },
  });

  const onHandQuery = useQuery({
    queryKey: ["product-stock-on-hand", id],
    queryFn: async () => {
      const { data } = await api.GET("/reports/stock-on-hand", {
        params: { query: { productId: id } },
      });
      return data?.rows ?? [];
    },
  });

  const valuationQuery = useQuery({
    queryKey: ["product-valuation", id],
    queryFn: async () => {
      const { data } = await api.GET("/reports/stock-valuation", {
        params: { query: { productId: id } },
      });
      return data?.rows ?? [];
    },
  });

  const stockCardQuery = useQuery({
    queryKey: ["product-stock-card", id],
    queryFn: async () => {
      const { data } = await api.GET("/reports/stock-card", {
        params: { query: { productId: id } },
      });
      return data?.entries ?? [];
    },
  });

  const save = async (values: ProductPayload) => {
    const { response, data } = await api.PATCH("/products/{productId}", {
      params: { path: { productId: id } },
      body: {
        name: values.name,
        baseUom: values.baseUom,
        isBatchTracked: values.isBatchTracked,
        barcode: values.barcode,
      },
    });
    if (!data) {
      toast.error(
        response.status === 409 ? m.catalog_conflict() : m.error_generic(),
      );
      return;
    }
    toast.success(m.settings_saved());
    setEditing(false);
    await invalidateProducts(id);
  };

  const setStatus = async (status: "active" | "archived") => {
    setArchiving(true);
    const { response } = await api.PATCH("/products/{productId}", {
      params: { path: { productId: id } },
      body: { status },
    });
    setArchiving(false);
    if (!response.ok) {
      toast.error(m.error_generic());
      return;
    }
    setConfirmArchive(false);
    await invalidateProducts(id);
  };

  if (productQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        {m.product_detail_not_found()}
      </p>
    );
  }

  const isActive = product.status === "active";

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/catalog" />}>
              {m.product_detail_breadcrumb_catalog()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/catalog/products" />}>
              {m.product_detail_breadcrumb_products()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{product.sku}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Product status (aktif/arsip) is a catalog state, not a document
          status - so the header reuses the record visual language (title +
          mono code + badge + action bar) but a plain Badge, never the
          document-only StatusBadge. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">
            {product.name}
          </h1>
          <span className="font-mono text-sm text-muted-foreground">
            {product.sku}
          </span>
          <Badge
            variant="secondary"
            className={
              isActive
                ? "bg-success/12 text-success"
                : "bg-muted text-muted-foreground"
            }
          >
            {isActive
              ? m.product_detail_status_active()
              : m.product_detail_status_archived()}
          </Badge>
          {product.isBatchTracked && (
            <Badge variant="outline">{m.product_detail_batch_badge()}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {m.product_detail_action_edit()}
          </Button>
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmArchive(true)}
            >
              {m.product_detail_action_archive()}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatus("active")}
            >
              {m.product_detail_action_activate()}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{m.product_detail_stock_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductStockTable
              onHand={onHandQuery.data ?? []}
              valuation={valuationQuery.data ?? []}
              batchTracked={product.isBatchTracked}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.product_detail_summary_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductSummaryCard valuation={valuationQuery.data ?? []} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.product_detail_identity_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">
                {m.product_detail_base_uom()}
              </dt>
              <dd className="text-sm">{product.baseUom}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">
                {m.product_detail_barcode()}
              </dt>
              <dd className="font-mono text-sm">
                {product.barcode ?? (
                  <span className="text-muted-foreground">
                    {m.product_detail_barcode_empty()}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <dt className="text-xs text-muted-foreground">
                {m.product_detail_uom_conversions()}
              </dt>
              <dd className="text-sm">
                {uomsQuery.data && uomsQuery.data.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {uomsQuery.data.map((u) => (
                      <li key={u.id} className="font-mono tabular-nums">
                        1 {u.uom} = {u.factorToBase} {product.baseUom}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">
                    {m.product_detail_uom_empty()}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{m.product_detail_stock_card_title()}</CardTitle>
          {/* /reports/stock-card is a Wave-2 route; plain anchor until it
              exists in the typed route tree. */}
          <a
            href="/reports/stock-card"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {m.product_detail_stock_card_see_all()} →
          </a>
        </CardHeader>
        <CardContent>
          <KartuStokTable entries={stockCardQuery.data ?? []} />
        </CardContent>
      </Card>

      {product.isBatchTracked && (
        <Card>
          <CardHeader>
            <CardTitle>{m.product_detail_batch_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            {batchesQuery.data && batchesQuery.data.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {batchesQuery.data.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="font-mono">{b.batchNo}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {b.expiryDate ?? m.product_detail_batch_no_expiry()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {m.product_detail_batch_empty()}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{m.product_detail_edit_title()}</SheetTitle>
            <SheetDescription>
              {m.product_detail_edit_description()}
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 pt-0">
            <ProductForm
              key={product.id}
              product={product}
              onSubmit={save}
              onCancel={() => setEditing(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={m.product_detail_archive_title()}
        specifics={m.product_detail_archive_specifics({
          name: product.name,
          sku: product.sku,
        })}
        confirmLabel={m.product_detail_action_archive()}
        destructive
        pending={archiving}
        onConfirm={() => setStatus("archived")}
      />
    </div>
  );
}
