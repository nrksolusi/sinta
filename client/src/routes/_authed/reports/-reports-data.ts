import { useQuery } from "@tanstack/react-query";
import type { SelectFieldOption } from "@/components/select-field";
import { api } from "@/lib/api";

// Filter state shared by both stock reports. Lives in the route's URL search
// params (shareable, survives back-nav per UX-D10); the helpers below keep the
// empty-state logic and the API query building in one testable place.
export interface ReportFilters {
  warehouseId?: string;
  productId?: string;
}

const FILTER_KEYS: (keyof ReportFilters)[] = ["warehouseId", "productId"];

// Which filters carry a value; drives the empty-state variant (first-use vs
// filtered) and whether the reset affordance shows.
export function activeReportFilters(
  filters: ReportFilters,
): (keyof ReportFilters)[] {
  return FILTER_KEYS.filter((key) => {
    const value = filters[key];
    return value != null && value !== "";
  });
}

// Build the openapi-fetch query object, dropping absent/empty filters so the
// server sees no param rather than an empty string.
export function reportQuery(
  filters: ReportFilters,
): Partial<Record<keyof ReportFilters, string>> {
  const query: Partial<Record<keyof ReportFilters, string>> = {};
  for (const key of activeReportFilters(filters)) {
    query[key] = filters[key];
  }
  return query;
}

// Filter-option sources. Both reports share the same gudang/produk pickers, so
// the option queries live here rather than duplicated in each route file.
export function useWarehouseOptions(): SelectFieldOption[] {
  const { data = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await api.GET("/warehouses");
      return data ?? [];
    },
  });
  return data.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }));
}

export function useProductOptions(): SelectFieldOption[] {
  const { data = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await api.GET("/products");
      return data ?? [];
    },
  });
  return data.map((p) => ({ value: p.id, label: `${p.sku} - ${p.name}` }));
}
