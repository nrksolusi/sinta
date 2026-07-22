import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { activeRole } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/settings/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { session } = Route.useRouteContext();
  return (
    <TenantProfileSection
      editable={activeRole(session) === "owner"}
      tenantId={session.activeTenantId ?? ""}
    />
  );
}

function TenantProfileSection({
  editable,
  tenantId,
}: {
  editable: boolean;
  tenantId: string;
}) {
  const { data: tenant } = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: async () => (await api.GET("/tenant")).data ?? null,
  });
  const [name, setName] = useState<string>();
  const [legalName, setLegalName] = useState<string>();

  if (!tenant) return null;

  const save = async () => {
    const { data } = await api.PATCH("/tenant", {
      body: { name, legalName },
    });
    if (!data) {
      toast.error(m.error_generic());
      return;
    }
    queryClient.setQueryData(["tenant", tenantId], data);
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    toast.success(m.settings_saved());
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{m.settings_profile()}</h2>
      <div className="space-y-1">
        <Label htmlFor="tenant-name">{m.settings_company_name()}</Label>
        <Input
          id="tenant-name"
          disabled={!editable}
          value={name ?? tenant.name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="tenant-legal-name">{m.settings_legal_name()}</Label>
        <Input
          id="tenant-legal-name"
          disabled={!editable}
          value={legalName ?? tenant.legalName}
          onChange={(e) => setLegalName(e.target.value)}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {m.settings_costing_label()}{" "}
        <strong>
          {tenant.costingMethod === "fifo"
            ? m.onboarding_costing_fifo()
            : m.onboarding_costing_avg()}
        </strong>
      </p>
      {editable && <Button onClick={save}>{m.settings_save()}</Button>}
    </section>
  );
}
