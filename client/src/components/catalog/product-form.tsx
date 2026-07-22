import { useForm } from "@tanstack/react-form";
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
  const form = useForm({
    defaultValues: {
      sku: product?.sku ?? "",
      name: product?.name ?? "",
      baseUom: product?.baseUom ?? "",
      barcode: product?.barcode ?? "",
      isBatchTracked: product?.isBatchTracked ?? false,
    },
    onSubmit: async ({ value }) => {
      if (product) {
        await onSubmit({
          name: value.name,
          baseUom: value.baseUom,
          isBatchTracked: value.isBatchTracked,
          barcode: value.barcode,
        });
      } else {
        await onSubmit({
          sku: value.sku,
          name: value.name,
          baseUom: value.baseUom,
          isBatchTracked: value.isBatchTracked,
          barcode: value.barcode || undefined,
        });
      }
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.Field name="sku">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="product-sku">{m.field_sku()}</Label>
            <Input
              id="product-sku"
              required
              disabled={!!product}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="name">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="product-name">{m.field_product_name()}</Label>
            <Input
              id="product-name"
              required
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="baseUom">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="product-base-uom">{m.field_base_uom()}</Label>
            <Input
              id="product-base-uom"
              required
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="barcode">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="product-barcode">{m.field_barcode()}</Label>
            <Input
              id="product-barcode"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="isBatchTracked">
        {(field) => (
          <div className="flex items-center gap-2">
            <Checkbox
              id="product-batch-tracked"
              aria-labelledby="product-batch-tracked-label"
              checked={field.state.value}
              onCheckedChange={(checked) =>
                field.handleChange(checked === true)
              }
            />
            <span
              id="product-batch-tracked-label"
              className="text-sm font-medium select-none"
            >
              {m.field_batch_tracked()}
            </span>
          </div>
        )}
      </form.Field>
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
