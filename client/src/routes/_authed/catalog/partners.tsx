import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { Partner } from "@/lib/catalog";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/catalog/partners")({
  component: PartnersPage,
});

// The warehouse screens cache supplier/customer lists under ["partners", role]
// (lib/catalog.ts) - keep them fresh alongside this page's own list.
async function invalidatePartners() {
  await queryClient.invalidateQueries({ queryKey: ["catalog-partners"] });
  await queryClient.invalidateQueries({ queryKey: ["partners"] });
}

function PartnersPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Partner | "new" | null>(null);

  const { data: partners = [] } = useQuery({
    queryKey: ["catalog-partners", showArchived ? "all" : "active"],
    queryFn: async () => {
      const { data } = await api.GET("/partners", {
        params: {
          query: showArchived ? {} : { status: "active" as const },
        },
      });
      return data ?? [];
    },
  });

  const save = async (values: {
    code?: string;
    name: string;
    isSupplier: boolean;
    isCustomer: boolean;
  }) => {
    const { response, data } =
      editing === "new"
        ? await api.POST("/partners", { body: values })
        : await api.PATCH("/partners/{partnerId}", {
            params: { path: { partnerId: (editing as Partner).id } },
            body: values,
          });
    if (!data) {
      toast.error(
        response.status === 409 ? m.catalog_conflict() : m.error_generic(),
      );
      return;
    }
    toast.success(m.settings_saved());
    setEditing(null);
    await invalidatePartners();
  };

  const setStatus = useCallback(
    async (partner: Partner, status: "active" | "archived") => {
      const { response } = await api.PATCH("/partners/{partnerId}", {
        params: { path: { partnerId: partner.id } },
        body: { status },
      });
      if (!response.ok) {
        toast.error(m.error_generic());
        return;
      }
      await invalidatePartners();
    },
    [],
  );

  const editingId = editing !== "new" && editing ? editing.id : null;

  const columns = useMemo<ColumnDef<Partner>[]>(
    () => [
      {
        accessorKey: "name",
        header: m.field_partner_name(),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.name}
            {row.original.status === "archived" && (
              <Badge variant="secondary" className="ml-2 font-normal">
                {m.catalog_status_archived()}
              </Badge>
            )}
          </span>
        ),
      },
      {
        id: "details",
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => {
          const partner = row.original;
          return (
            <span className="text-sm text-muted-foreground">
              {[
                partner.code,
                partner.isSupplier ? m.field_supplier() : null,
                partner.isCustomer ? m.field_customer() : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          );
        },
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => {
          const partner = row.original;
          return (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditing(editingId === partner.id ? null : partner)
                }
              >
                {m.action_edit()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setStatus(
                    partner,
                    partner.status === "active" ? "archived" : "active",
                  )
                }
              >
                {partner.status === "active"
                  ? m.catalog_archive()
                  : m.catalog_activate()}
              </Button>
            </div>
          );
        },
      },
    ],
    [editingId, setStatus],
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">{m.catalog_partners()}</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="partners-show-archived"
              aria-labelledby="partners-show-archived-label"
              checked={showArchived}
              onCheckedChange={(checked) => setShowArchived(checked === true)}
            />
            <span id="partners-show-archived-label" className="select-none">
              {m.catalog_show_archived()}
            </span>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            {m.catalog_add_partner()}
          </Button>
        </div>
      </div>

      {editing === "new" && (
        <div className="rounded-md border p-4">
          <PartnerForm onSubmit={save} onCancel={() => setEditing(null)} />
        </div>
      )}

      {partners.length === 0 && editing !== "new" ? (
        <p className="text-sm text-muted-foreground">{m.catalog_empty()}</p>
      ) : (
        <DataTable
          columns={columns}
          data={partners}
          getRowId={(p) => p.id}
          expandedRowId={editingId}
          renderExpandedRow={(partner) => (
            <PartnerForm
              key={partner.id}
              partner={partner}
              onSubmit={save}
              onCancel={() => setEditing(null)}
            />
          )}
        />
      )}
    </section>
  );
}

function PartnerForm({
  partner,
  onSubmit,
  onCancel,
}: {
  partner?: Partner;
  onSubmit: (values: {
    code?: string;
    name: string;
    isSupplier: boolean;
    isCustomer: boolean;
  }) => void | Promise<void>;
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
