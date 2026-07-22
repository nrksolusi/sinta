import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { queryClient } from "@/lib/query";
import { activeRole } from "@/lib/session";
import { m } from "@/paraglide/messages";

type TenantProfile = components["schemas"]["TenantProfile"];

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

  if (!tenant) return null;

  return (
    <TenantProfileForm
      tenant={tenant}
      editable={editable}
      tenantId={tenantId}
    />
  );
}

function TenantProfileForm({
  tenant,
  editable,
  tenantId,
}: {
  tenant: TenantProfile;
  editable: boolean;
  tenantId: string;
}) {
  const form = useForm({
    defaultValues: {
      name: tenant.name,
      legalName: tenant.legalName ?? "",
    },
    onSubmit: async ({ value }) => {
      const { data } = await api.PATCH("/tenant", {
        body: { name: value.name, legalName: value.legalName },
      });
      if (!data) {
        toast.error(m.error_generic());
        return;
      }
      queryClient.setQueryData(["tenant", tenantId], data);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success(m.settings_saved());
    },
  });

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{m.settings_profile()}</h2>
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
              <Label htmlFor="tenant-name">{m.settings_company_name()}</Label>
              <Input
                id="tenant-name"
                disabled={!editable}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="legalName">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="tenant-legal-name">
                {m.settings_legal_name()}
              </Label>
              <Input
                id="tenant-legal-name"
                disabled={!editable}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
        <p className="text-sm text-muted-foreground">
          {m.settings_costing_label()}{" "}
          <strong>
            {tenant.costingMethod === "fifo"
              ? m.onboarding_costing_fifo()
              : m.onboarding_costing_avg()}
          </strong>
        </p>
        {editable && <Button type="submit">{m.settings_save()}</Button>}
      </form>
    </section>
  );
}
