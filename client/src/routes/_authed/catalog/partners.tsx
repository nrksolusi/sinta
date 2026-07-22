import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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

  const setStatus = async (partner: Partner, status: "active" | "archived") => {
    const { response } = await api.PATCH("/partners/{partnerId}", {
      params: { path: { partnerId: partner.id } },
      body: { status },
    });
    if (!response.ok) {
      toast.error(m.error_generic());
      return;
    }
    await invalidatePartners();
  };

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

      {partners.length === 0 && editing !== "new" && (
        <p className="text-sm text-muted-foreground">{m.catalog_empty()}</p>
      )}

      <ul className="divide-y rounded-md border empty:hidden">
        {partners.map((partner) => (
          <li key={partner.id} className="space-y-3 p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {partner.name}
                  {partner.status === "archived" && (
                    <Badge variant="secondary" className="ml-2 font-normal">
                      {m.catalog_status_archived()}
                    </Badge>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {[
                    partner.code,
                    partner.isSupplier ? m.field_supplier() : null,
                    partner.isCustomer ? m.field_customer() : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditing(
                    editing !== "new" && editing?.id === partner.id
                      ? null
                      : partner,
                  )
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
            {editing !== "new" && editing?.id === partner.id && (
              <div className="rounded-md border p-4">
                <PartnerForm
                  key={partner.id}
                  partner={editing}
                  onSubmit={save}
                  onCancel={() => setEditing(null)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
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
  const [code, setCode] = useState(partner?.code ?? "");
  const [name, setName] = useState(partner?.name ?? "");
  const [isSupplier, setIsSupplier] = useState(partner?.isSupplier ?? false);
  const [isCustomer, setIsCustomer] = useState(partner?.isCustomer ?? false);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        // Patch semantics: an empty code clears it on edit, and is simply
        // omitted on create.
        onSubmit({
          code: partner ? code : code || undefined,
          name,
          isSupplier,
          isCustomer,
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="partner-name">{m.field_partner_name()}</Label>
        <Input
          id="partner-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="partner-code">{m.field_partner_code()}</Label>
        <Input
          id="partner-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <div className="flex gap-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            id="partner-is-supplier"
            aria-labelledby="partner-is-supplier-label"
            checked={isSupplier}
            onCheckedChange={(checked) => setIsSupplier(checked === true)}
          />
          <span id="partner-is-supplier-label" className="select-none">
            {m.field_supplier()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            id="partner-is-customer"
            aria-labelledby="partner-is-customer-label"
            checked={isCustomer}
            onCheckedChange={(checked) => setIsCustomer(checked === true)}
          />
          <span id="partner-is-customer-label" className="select-none">
            {m.field_customer()}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={!isSupplier && !isCustomer}>
          {m.action_save()}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.action_cancel()}
        </Button>
      </div>
    </form>
  );
}
