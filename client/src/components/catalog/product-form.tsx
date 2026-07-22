import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <div className="space-y-1">
        <Label htmlFor="product-sku">{m.field_sku()}</Label>
        <Input
          id="product-sku"
          required
          disabled={!!product}
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="product-name">{m.field_product_name()}</Label>
        <Input
          id="product-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="product-base-uom">{m.field_base_uom()}</Label>
        <Input
          id="product-base-uom"
          required
          value={baseUom}
          onChange={(e) => setBaseUom(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="product-barcode">{m.field_barcode()}</Label>
        <Input
          id="product-barcode"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="product-batch-tracked"
          aria-labelledby="product-batch-tracked-label"
          checked={isBatchTracked}
          onCheckedChange={(checked) => setIsBatchTracked(checked === true)}
        />
        <span
          id="product-batch-tracked-label"
          className="text-sm font-medium select-none"
        >
          {m.field_batch_tracked()}
        </span>
      </div>
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
