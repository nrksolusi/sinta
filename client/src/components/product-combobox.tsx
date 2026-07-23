import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { PickerDialog } from "@/lib/picker-dialog";
import type { Product, ProductOption } from "@/lib/pickers-data";
import {
  pickerProductsQueryOptions,
  pickerStockOnHandQueryOptions,
  productToOption,
  stockByProduct,
} from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";
import { ComboboxCore, type Searcher } from "./combobox";

export interface ProductComboboxProps {
  value?: string;
  onSelect: (product: Product) => void;
  disabled?: boolean;
  // Admin inline "Create product" affordance in the no-match state.
  allowCreate?: boolean;
  // Fired instead of onSelect when the user picks "Create product"; receives the
  // typed query. Absent when allowCreate is false.
  onCreate?: (query: string) => void;
  // Product ids to surface (in order) when the query is empty.
  recentIds?: string[];
  // When set, each row shows the product's on-hand qty in this warehouse.
  warehouseId?: string;
  // Async override for the option source (client-side filter at M1). When
  // absent, the combobox fetches active products itself.
  onSearch?: Searcher<Product>;
  // Display name for the trigger button. When absent and value is set, the
  // default variant resolves it from its local product list.
  selectedLabel?: string;
}

// Product picker (UX-D5). cmdk Command with shouldFilter off, debounced search
// over the active-product list. Rows: name / mono SKU / unit / stock-on-hand
// (right-aligned, via format.ts) when a warehouse is known.
export function ProductCombobox(props: ProductComboboxProps) {
  if (props.onSearch) {
    return (
      <ProductComboboxBody {...props} searcher={props.onSearch} products={[]} />
    );
  }
  return <ProductComboboxDefault {...props} />;
}

// Default data path: fetch active products (and stock-on-hand for the warehouse)
// and build a client-side searcher. Split into its own component so the queries
// mount only when no onSearch override is supplied.
function ProductComboboxDefault(props: ProductComboboxProps) {
  const { data: products = [] } = useQuery(pickerProductsQueryOptions);
  const { data: stockRows = [] } = useQuery({
    ...pickerStockOnHandQueryOptions(props.warehouseId),
    enabled: Boolean(props.warehouseId),
  });

  const searcher = useCallback<Searcher<Product>>(
    (query) => {
      const stock = props.warehouseId ? stockByProduct(stockRows) : undefined;
      const toOption = (product: Product): ProductOption => {
        const option = productToOption(product);
        return stock
          ? { ...option, stock: stock.get(product.id) ?? 0 }
          : option;
      };
      const q = query.trim().toLowerCase();
      if (q === "") {
        const byId = new Map(products.map((p) => [p.id, p]));
        const recents = (props.recentIds ?? [])
          .map((id) => byId.get(id))
          .filter((p): p is Product => Boolean(p));
        return Promise.resolve(
          (recents.length > 0 ? recents : products).map(toOption),
        );
      }
      return Promise.resolve(
        products
          .filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.sku.toLowerCase().includes(q) ||
              (p.barcode ?? "").toLowerCase().includes(q),
          )
          .map(toOption),
      );
    },
    [products, stockRows, props.warehouseId, props.recentIds],
  );

  const resolvedLabel =
    props.selectedLabel ??
    (props.value
      ? products.find((p) => p.id === props.value)?.name
      : undefined);

  return (
    <ProductComboboxBody
      {...props}
      searcher={searcher}
      products={products}
      selectedLabel={resolvedLabel}
    />
  );
}

function ProductComboboxBody({
  value,
  onSelect,
  disabled,
  allowCreate,
  onCreate,
  recentIds,
  warehouseId,
  searcher,
  selectedLabel,
}: ProductComboboxProps & {
  searcher: Searcher<Product>;
  products: Product[];
}) {
  return (
    <PickerDialog
      label={m.picker_select_product()}
      selectedLabel={selectedLabel}
      disabled={disabled}
    >
      <ComboboxCore<Product>
        value={value}
        onSelect={onSelect}
        disabled={disabled}
        searcher={searcher}
        placeholder={m.combobox_search_product()}
        recentsLabel={m.combobox_recents()}
        recentIds={recentIds}
        resultsLabel={m.combobox_results()}
        renderTrailing={
          warehouseId
            ? (option) =>
                option.stock === undefined ? null : formatNumber(option.stock)
            : undefined
        }
        noMatch={
          allowCreate
            ? (query) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onCreate?.(query)}
                >
                  {m.combobox_create({ query })}
                </Button>
              )
            : undefined
        }
      />
    </PickerDialog>
  );
}
