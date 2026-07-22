import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Warehouse } from "@/lib/catalog";
import { m } from "@/paraglide/messages";

export interface WarehouseFormValues {
  code: string;
  name: string;
}

export function WarehouseForm({
  warehouse,
  onSubmit,
  onCancel,
}: {
  warehouse?: Warehouse;
  onSubmit: (values: WarehouseFormValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm({
    defaultValues: {
      code: warehouse?.code ?? "",
      name: warehouse?.name ?? "",
    },
    onSubmit: async ({ value }) => {
      await onSubmit({ code: value.code, name: value.name });
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
      <form.Field name="code">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="warehouse-code">{m.field_warehouse_code()}</Label>
            <Input
              id="warehouse-code"
              required
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="name">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="warehouse-name">{m.field_warehouse_name()}</Label>
            <Input
              id="warehouse-name"
              required
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <div className="flex gap-2">
        <Button type="submit">{m.action_save()}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.action_cancel()}
        </Button>
      </div>
    </form>
  );
}
