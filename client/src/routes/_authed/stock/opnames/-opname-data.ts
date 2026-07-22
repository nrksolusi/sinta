// Shared queries and small mappers for the opname screens. Kept here so the
// list, entry-flow, and detail routes read from one cached source.
import { queryOptions } from "@tanstack/react-query";
import type { DocumentStatus } from "@/components/status-badge";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import type { ProductFacts } from "./-opname-sheet";

type StockOpname = components["schemas"]["StockOpname"];
type Product = components["schemas"]["Product"];

export const opnamesQueryOptions = queryOptions({
  queryKey: ["stock-opnames"],
  queryFn: async (): Promise<StockOpname[]> => {
    const { data } = await api.GET("/stock-opnames");
    return data ?? [];
  },
});

export function opnameQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["stock-opname", id],
    queryFn: async (): Promise<StockOpname | null> => {
      const { data } = await api.GET("/stock-opnames/{id}", {
        params: { path: { id } },
      });
      return data ?? null;
    },
  });
}

// Index the catalog product list into the ProductFacts map the sheet helpers
// consume (name/sku/baseUom by product id).
export function productFactsById(
  products: Product[],
): Map<string, ProductFacts> {
  return new Map(
    products.map((p) => [
      p.id,
      { name: p.name, sku: p.sku, baseUom: p.baseUom },
    ]),
  );
}

// The API status is the DocumentStatus enum; narrow it to the StatusBadge type
// (the "pending" arm is an M2 slot the badge already supports).
export function badgeStatus(status: StockOpname["status"]): DocumentStatus {
  return status as DocumentStatus;
}
