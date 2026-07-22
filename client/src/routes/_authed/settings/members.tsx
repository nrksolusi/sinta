import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
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
import { ROLES, type Role, roleLabel } from "@/lib/roles";
import { activeRole } from "@/lib/session";
import { m } from "@/paraglide/messages";

type Member = components["schemas"]["Member"];

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

  const changeRole = useCallback(
    async (userId: string, role: Role) => {
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
    },
    [refetch, router],
  );

  const remove = useCallback(
    async (userId: string) => {
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
    },
    [refetch],
  );

  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      {
        accessorKey: "name",
        header: m.field_name(),
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "email",
        header: m.field_email(),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "role",
        header: m.field_role(),
        enableSorting: false,
        cell: ({ row }) => {
          const member = row.original;
          if (!canManage) {
            return <span className="text-sm">{roleLabel(member.role)}</span>;
          }
          return (
            <div className="flex justify-end gap-2">
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
            </div>
          );
        },
      },
    ],
    [canManage, myUserId, changeRole, remove],
  );

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{m.settings_members()}</h2>
      <DataTable
        columns={columns}
        data={members ?? []}
        getRowId={(member) => member.userId}
      />
    </section>
  );
}
