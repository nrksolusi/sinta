import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Partner } from "@/lib/catalog";
import { m } from "@/paraglide/messages";

export interface PartnerFormValues {
  code?: string;
  name: string;
  isSupplier: boolean;
  isCustomer: boolean;
}

export function PartnerForm({
  partner,
  onSubmit,
  onCancel,
}: {
  partner?: Partner;
  onSubmit: (values: PartnerFormValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  // A partner must be a supplier, a customer, or both. Enforced through the
  // form so the submit button reflects validity instead of ad-hoc disabling.
  const requireRole = ({
    value,
  }: {
    value: { isSupplier: boolean; isCustomer: boolean };
  }) => (!value.isSupplier && !value.isCustomer ? "role_required" : undefined);

  const form = useForm({
    defaultValues: {
      code: partner?.code ?? "",
      name: partner?.name ?? "",
      isSupplier: partner?.isSupplier ?? false,
      isCustomer: partner?.isCustomer ?? false,
    },
    validators: { onMount: requireRole, onChange: requireRole },
    onSubmit: async ({ value }) => {
      // Patch semantics: an empty code clears it on edit, and is simply
      // omitted on create.
      await onSubmit({
        code: partner ? value.code : value.code || undefined,
        name: value.name,
        isSupplier: value.isSupplier,
        isCustomer: value.isCustomer,
      });
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
      <form.Field name="name">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="partner-name">{m.field_partner_name()}</Label>
            <Input
              id="partner-name"
              required
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="code">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="partner-code">{m.field_partner_code()}</Label>
            <Input
              id="partner-code"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <div className="flex gap-4">
        <form.Field name="isSupplier">
          {(field) => (
            <div className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                id="partner-is-supplier"
                aria-labelledby="partner-is-supplier-label"
                checked={field.state.value}
                onCheckedChange={(checked) =>
                  field.handleChange(checked === true)
                }
              />
              <span id="partner-is-supplier-label" className="select-none">
                {m.field_supplier()}
              </span>
            </div>
          )}
        </form.Field>
        <form.Field name="isCustomer">
          {(field) => (
            <div className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                id="partner-is-customer"
                aria-labelledby="partner-is-customer-label"
                checked={field.state.value}
                onCheckedChange={(checked) =>
                  field.handleChange(checked === true)
                }
              />
              <span id="partner-is-customer-label" className="select-none">
                {m.field_customer()}
              </span>
            </div>
          )}
        </form.Field>
      </div>
      <div className="flex gap-2">
        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Button type="submit" disabled={!canSubmit}>
              {m.action_save()}
            </Button>
          )}
        </form.Subscribe>
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.action_cancel()}
        </Button>
      </div>
    </form>
  );
}
