import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import type { components } from "./api-types";

export type Product = components["schemas"]["Product"];
export type Partner = components["schemas"]["Partner"];
export type Warehouse = components["schemas"]["Warehouse"];
export type StockOnHandRow = components["schemas"]["StockOnHandRow"];

// One selectable row in a combobox. `product` (or `partner` / `warehouse`)
// carries the full record so onSelect hands the caller everything it needs; the
// display fields are pre-derived so the row renders without re-deriving.
export interface Option<T = unknown> {
  id: string;
  label: string;
  // Secondary line: SKU / code, rendered mono.
  code?: string;
  // Unit of measure (products only).
  unit?: string;
  // On-hand quantity in base units (products only, when a warehouse is known).
  stock?: number;
  value: T;
}

export type ProductOption = Option<Product>;
export type PartnerOption = Option<Partner>;
export type WarehouseOption = Option<Warehouse>;

export function productToOption(product: Product): ProductOption {
  return {
    id: product.id,
    label: product.name,
    code: product.sku,
    unit: product.baseUom,
    value: product,
  };
}

export function partnerToOption(partner: Partner): PartnerOption {
  return {
    id: partner.id,
    label: partner.name,
    code: partner.code,
    value: partner,
  };
}

export function warehouseToOption(warehouse: Warehouse): WarehouseOption {
  return {
    id: warehouse.id,
    label: warehouse.name,
    code: warehouse.code,
    value: warehouse,
  };
}

// Active products, cached alongside the catalog screens' ["products"] key.
export const pickerProductsQueryOptions = queryOptions({
  queryKey: ["products", "active"],
  queryFn: async (): Promise<Product[]> => {
    const { data } = await api.GET("/products", {
      params: { query: { status: "active" } },
    });
    return data ?? [];
  },
});

export function pickerPartnersQueryOptions(role: "supplier" | "customer") {
  return queryOptions({
    queryKey: ["partners", role],
    queryFn: async (): Promise<Partner[]> => {
      const { data } = await api.GET("/partners", {
        params: { query: { role, status: "active" } },
      });
      return data ?? [];
    },
  });
}

export const pickerWarehousesQueryOptions = queryOptions({
  queryKey: ["warehouses"],
  queryFn: async (): Promise<Warehouse[]> => {
    const { data } = await api.GET("/warehouses");
    return data ?? [];
  },
});

// Stock-on-hand rows for a warehouse, keyed for the ProductCombobox stock
// column. Folded to a productId -> total qty map by the combobox.
export function pickerStockOnHandQueryOptions(warehouseId: string | undefined) {
  return queryOptions({
    queryKey: ["stock-on-hand", warehouseId ?? "all"],
    queryFn: async (): Promise<StockOnHandRow[]> => {
      const { data } = await api.GET("/reports/stock-on-hand", {
        params: {
          query: warehouseId ? { warehouseId } : {},
        },
      });
      return data?.rows ?? [];
    },
  });
}

// Sums batch rows into per-product on-hand totals (base units, decimal string).
export function stockByProduct(rows: StockOnHandRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(
      row.productId,
      (totals.get(row.productId) ?? 0) + Number(row.qtyOnHand),
    );
  }
  return totals;
}
