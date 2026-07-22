import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
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
import { ROLES, type Role, roleLabel } from "@/lib/roles";
import { activeRole } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/settings/members")({
  component: MembersPage,
});

function MembersPage() {
  const { session } = Route.useRouteContext();
  return (
    <MembersSection
      canManage={activeRole(session) === "owner"}
      myUserId={session.user.id}
      tenantId={session.activeTenantId ?? ""}
    />
  );
}

function MembersSection({
  canManage,
  myUserId,
  tenantId,
}: {
  canManage: boolean;
  myUserId: string;
  tenantId: string;
}) {
  const router = useRouter();
  const { data: members, refetch } = useQuery({
    queryKey: ["members", tenantId],
    queryFn: async () => (await api.GET("/tenant/members")).data ?? [],
  });

  const changeRole = async (userId: string, role: Role) => {
    const { response } = await api.PATCH("/tenant/members/{userId}", {
      params: { path: { userId } },
      body: { role },
    });
    if (response.status === 409) {
      toast.error(m.settings_last_owner_error());
      return;
    }
    if (!response.ok) {
      toast.error(m.error_generic());
      return;
    }
    await refetch();
    await router.invalidate();
  };

  const remove = async (userId: string) => {
    const { response } = await api.DELETE("/tenant/members/{userId}", {
      params: { path: { userId } },
    });
    if (response.status === 409) {
      toast.error(m.settings_last_owner_error());
      return;
    }
    if (!response.ok) {
      toast.error(m.error_generic());
      return;
    }
    await refetch();
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{m.settings_members()}</h2>
      <ul className="divide-y rounded-md border">
        {(members ?? []).map((member) => (
          <li key={member.userId} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{member.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {member.email}
              </p>
            </div>
            {canManage ? (
              <>
                <Select
                  value={member.role}
                  onValueChange={(value) =>
                    value && changeRole(member.userId, value as Role)
                  }
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {member.userId !== myUserId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => remove(member.userId)}
                  >
                    {m.settings_member_remove()}
                  </Button>
                )}
              </>
            ) : (
              <span className="text-sm">{roleLabel(member.role)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
