import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import type { components } from "./api-types";

export type Product = components["schemas"]["Product"];
export type Warehouse = components["schemas"]["Warehouse"];
export type Partner = components["schemas"]["Partner"];

// Catalog reads for the warehouse screens. All tenant-scoped by the session
// cookie; kept small and cached so barcode resolution stays client-side.
export const productsQueryOptions = queryOptions({
  queryKey: ["products", "active"],
  queryFn: async (): Promise<Product[]> => {
    const { data } = await api.GET("/products", {
      params: { query: { status: "active" } },
    });
    return data ?? [];
  },
});

export const warehousesQueryOptions = queryOptions({
  queryKey: ["warehouses"],
  queryFn: async (): Promise<Warehouse[]> => {
    const { data } = await api.GET("/warehouses");
    return data ?? [];
  },
});

export function partnersQueryOptions(role: "supplier" | "customer") {
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
