import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {m.catalog_show_archived()}
          </label>
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
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                      {m.catalog_status_archived()}
                    </span>
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
      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.field_partner_name()}</span>
        <input
          className="w-full rounded-md border px-3 py-2"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.field_partner_code()}</span>
        <input
          className="w-full rounded-md border px-3 py-2"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={isSupplier}
            onChange={(e) => setIsSupplier(e.target.checked)}
          />
          {m.field_supplier()}
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={isCustomer}
            onChange={(e) => setIsCustomer(e.target.checked)}
          />
          {m.field_customer()}
        </label>
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
