import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/catalog";
import { m } from "@/paraglide/messages";

// The wire payload for both modes. Create includes the SKU; edit omits it (the
// SKU is immutable) and sends barcode "" to clear it (patch semantics).
export type ProductPayload = {
  sku?: string;
  name: string;
  baseUom: string;
  isBatchTracked: boolean;
  barcode?: string;
};

export function ProductForm({
  product,
  onSubmit,
  onCancel,
}: {
  product?: Product;
  onSubmit: (values: ProductPayload) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [baseUom, setBaseUom] = useState(product?.baseUom ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [isBatchTracked, setIsBatchTracked] = useState(
    product?.isBatchTracked ?? false,
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (product) {
          onSubmit({ name, baseUom, isBatchTracked, barcode });
        } else {
          onSubmit({
            sku,
            name,
            baseUom,
            isBatchTracked,
            barcode: barcode || undefined,
          });
        }
      }}
    >
      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.field_sku()}</span>
        <input
          className="w-full rounded-md border px-3 py-2 disabled:opacity-60"
          required
          disabled={!!product}
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.field_product_name()}</span>
        <input
          className="w-full rounded-md border px-3 py-2"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.field_base_uom()}</span>
        <input
          className="w-full rounded-md border px-3 py-2"
          required
          value={baseUom}
          onChange={(e) => setBaseUom(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.field_barcode()}</span>
        <input
          className="w-full rounded-md border px-3 py-2"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isBatchTracked}
          onChange={(e) => setIsBatchTracked(e.target.checked)}
        />
        <span className="text-sm font-medium">{m.field_batch_tracked()}</span>
      </label>
      <div className="flex gap-2">
        <Button type="submit">{m.action_save()}</Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {m.action_cancel()}
          </Button>
        )}
      </div>
    </form>
  );
}
