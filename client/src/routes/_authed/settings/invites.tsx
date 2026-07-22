import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ROLES, type Role, roleLabel } from "@/lib/roles";
import { activeRole } from "@/lib/session";
import { m } from "@/paraglide/messages";

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
  const [role, setRole] = useState<Role>("warehouse");

  const create = async () => {
    const { data } = await api.POST("/tenant/invites", { body: { role } });
    if (!data) {
      toast.error(m.error_generic());
      return;
    }
    await refetch();
  };

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/invite/${token}`,
    );
    toast.success(m.settings_invite_copied());
  };

  const revoke = async (inviteId: string) => {
    const { response } = await api.DELETE("/tenant/invites/{inviteId}", {
      params: { path: { inviteId } },
    });
    if (!response.ok) {
      toast.error(m.error_generic());
      return;
    }
    await refetch();
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{m.settings_invites()}</h2>
      <div className="flex items-center gap-2">
        <Select
          value={role}
          onValueChange={(value) => value && setRole(value as Role)}
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
        <Button size="sm" onClick={create}>
          {m.settings_invite_create()}
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {(invites ?? []).map((invite) => (
          <li key={invite.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{roleLabel(invite.role)}</p>
              <p className="text-sm text-muted-foreground">
                {m.settings_invite_expires({
                  date: formatDate(invite.expiresAt),
                })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copy(invite.token)}
            >
              {m.settings_invite_copy()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => revoke(invite.id)}
            >
              {m.settings_invite_revoke()}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
