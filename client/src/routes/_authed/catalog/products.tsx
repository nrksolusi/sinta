import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  ProductForm,
  type ProductPayload,
} from "@/components/catalog/product-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { Product } from "@/lib/catalog";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/catalog/products")({
  component: ProductsPage,
});

// The warehouse screens cache the active-product list under ["products"]
// (lib/catalog.ts) - keep it fresh alongside this page's own list.
async function invalidateProducts() {
  await queryClient.invalidateQueries({ queryKey: ["catalog-products"] });
  await queryClient.invalidateQueries({ queryKey: ["products"] });
}

function saveFailed(status: number) {
  toast.error(status === 409 ? m.catalog_conflict() : m.error_generic());
}

function ProductsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["catalog-products", showArchived ? "all" : "active"],
    queryFn: async () => {
      const { data } = await api.GET("/products", {
        params: {
          query: showArchived ? {} : { status: "active" as const },
        },
      });
      return data ?? [];
    },
  });

  const save = async (values: ProductPayload) => {
    const { response, data } =
      editing === "new"
        ? await api.POST("/products", {
            body: { ...values, sku: values.sku ?? "" },
          })
        : await api.PATCH("/products/{productId}", {
            params: { path: { productId: (editing as Product).id } },
            body: {
              name: values.name,
              baseUom: values.baseUom,
              isBatchTracked: values.isBatchTracked,
              barcode: values.barcode,
            },
          });
    if (!data) {
      saveFailed(response.status);
      return;
    }
    toast.success(m.settings_saved());
    setEditing(editing === "new" ? null : data);
    await invalidateProducts();
  };

  const setStatus = async (product: Product, status: "active" | "archived") => {
    const { response } = await api.PATCH("/products/{productId}", {
      params: { path: { productId: product.id } },
      body: { status },
    });
    if (!response.ok) {
      toast.error(m.error_generic());
      return;
    }
    await invalidateProducts();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">{m.catalog_products()}</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="products-show-archived"
              aria-labelledby="products-show-archived-label"
              checked={showArchived}
              onCheckedChange={(checked) => setShowArchived(checked === true)}
            />
            <span id="products-show-archived-label" className="select-none">
              {m.catalog_show_archived()}
            </span>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            {m.catalog_add_product()}
          </Button>
        </div>
      </div>

      {editing === "new" && (
        <div className="rounded-md border p-4">
          <ProductForm onSubmit={save} onCancel={() => setEditing(null)} />
        </div>
      )}

      {products.length === 0 && editing !== "new" && (
        <p className="text-sm text-muted-foreground">{m.catalog_empty()}</p>
      )}

      <ul className="divide-y rounded-md border empty:hidden">
        {products.map((product) => (
          <li key={product.id} className="space-y-3 p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {product.name}
                  {product.status === "archived" && (
                    <Badge variant="secondary" className="ml-2 font-normal">
                      {m.catalog_status_archived()}
                    </Badge>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {product.sku} · {product.baseUom}
                  {product.barcode ? ` · ${product.barcode}` : ""}
                  {product.isBatchTracked
                    ? ` · ${m.field_batch_tracked()}`
                    : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditing(
                    editing !== "new" && editing?.id === product.id
                      ? null
                      : product,
                  )
                }
              >
                {m.action_edit()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setStatus(
                    product,
                    product.status === "active" ? "archived" : "active",
                  )
                }
              >
                {product.status === "active"
                  ? m.catalog_archive()
                  : m.catalog_activate()}
              </Button>
            </div>
            {editing !== "new" && editing?.id === product.id && (
              <div className="space-y-4 rounded-md border p-4">
                <ProductForm
                  key={product.id}
                  product={editing}
                  onSubmit={save}
                  onCancel={() => setEditing(null)}
                />
                <UomSection product={editing} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function UomSection({ product }: { product: Product }) {
  const { data: uoms = [], refetch } = useQuery({
    queryKey: ["catalog-uoms", product.id],
    queryFn: async () => {
      const { data } = await api.GET("/products/{productId}/uoms", {
        params: { path: { productId: product.id } },
      });
      return data ?? [];
    },
  });
  const [uom, setUom] = useState("");
  const [factor, setFactor] = useState("");

  const add = async () => {
    const { response, data } = await api.POST("/products/{productId}/uoms", {
      params: { path: { productId: product.id } },
      body: { uom, factorToBase: factor },
    });
    if (!data) {
      saveFailed(response.status);
      return;
    }
    setUom("");
    setFactor("");
    await refetch();
  };

  const remove = async (uomId: string) => {
    const { response } = await api.DELETE(
      "/products/{productId}/uoms/{uomId}",
      { params: { path: { productId: product.id, uomId } } },
    );
    if (!response.ok) {
      toast.error(m.error_generic());
      return;
    }
    await refetch();
  };

  return (
    <section className="space-y-2 border-t pt-3">
      <h3 className="text-sm font-medium">{m.uom_title()}</h3>
      <p className="text-sm text-muted-foreground">{m.uom_hint()}</p>
      <ul className="space-y-1">
        {uoms.map((u) => (
          <li key={u.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1">
              1 {u.uom} = {u.factorToBase} {product.baseUom}
            </span>
            <Button variant="outline" size="sm" onClick={() => remove(u.id)}>
              {m.action_remove()}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="uom-code">{m.field_uom()}</Label>
          <Input
            id="uom-code"
            value={uom}
            onChange={(e) => setUom(e.target.value)}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="uom-factor">{m.field_factor_to_base()}</Label>
          <Input
            id="uom-factor"
            inputMode="decimal"
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
          />
        </div>
        <Button size="sm" disabled={!uom || !factor} onClick={add}>
          {m.uom_add()}
        </Button>
      </div>
    </section>
  );
}
