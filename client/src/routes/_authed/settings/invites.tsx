import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { formatDate } from "@/lib/format";
import { ROLES, type Role, roleLabel } from "@/lib/roles";
import { activeRole } from "@/lib/session";
import { m } from "@/paraglide/messages";

type Invite = components["schemas"]["Invite"];

export const Route = createFileRoute("/_authed/settings/invites")({
  beforeLoad: ({ context }) => {
    // Mirrors the server's canManageInvites guard so a deep link by a member
    // without the permission lands on a page they can use.
    const role = activeRole(context.session);
    if (role !== "owner" && role !== "admin") {
      throw redirect({ to: "/settings/profile" });
    }
  },
  component: InvitesPage,
});

function InvitesPage() {
  const { session } = Route.useRouteContext();
  return <InvitesSection tenantId={session.activeTenantId ?? ""} />;
}

function InvitesSection({ tenantId }: { tenantId: string }) {
  const { data: invites, refetch } = useQuery({
    queryKey: ["invites", tenantId],
    queryFn: async () => (await api.GET("/tenant/invites")).data ?? [],
  });
  const form = useForm({
    defaultValues: { role: "warehouse" as Role },
    onSubmit: async ({ value }) => {
      const { data } = await api.POST("/tenant/invites", {
        body: { role: value.role },
      });
      if (!data) {
        toast.error(m.error_generic());
        return;
      }
      await refetch();
    },
  });

  const copy = useCallback(async (token: string) => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/invite/${token}`,
    );
    toast.success(m.settings_invite_copied());
  }, []);

  const revoke = useCallback(
    async (inviteId: string) => {
      const { response } = await api.DELETE("/tenant/invites/{inviteId}", {
        params: { path: { inviteId } },
      });
      if (!response.ok) {
        toast.error(m.error_generic());
        return;
      }
      await refetch();
    },
    [refetch],
  );

  const columns = useMemo<ColumnDef<Invite>[]>(
    () => [
      {
        accessorKey: "role",
        header: m.field_role(),
        cell: ({ row }) => (
          <span className="font-medium">{roleLabel(row.original.role)}</span>
        ),
      },
      {
        id: "expires",
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {m.settings_invite_expires({
              date: formatDate(row.original.expiresAt),
            })}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copy(row.original.token)}
            >
              {m.settings_invite_copy()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => revoke(row.original.id)}
            >
              {m.settings_invite_revoke()}
            </Button>
          </div>
        ),
      },
    ],
    [copy, revoke],
  );

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{m.settings_invites()}</h2>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <form.Field name="role">
          {(field) => (
            <Select
              value={field.state.value}
              onValueChange={(value) =>
                value && field.handleChange(value as Role)
              }
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.filter((r) => r !== "owner").map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </form.Field>
        <Button size="sm" type="submit">
          {m.settings_invite_create()}
        </Button>
      </form>
      <DataTable
        columns={columns}
        data={invites ?? []}
        getRowId={(invite) => invite.id}
      />
    </section>
  );
}
