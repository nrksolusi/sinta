import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { ROLES, type Role, roleLabel } from "@/lib/roles";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { session } = Route.useRouteContext();
  const myRole = session.memberships.find(
    (mb) => mb.tenant.id === session.activeTenantId,
  )?.role;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-4">
      <h1 className="text-2xl font-semibold">{m.settings_title()}</h1>
      <TenantProfileSection editable={myRole === "owner"} />
      <MembersSection
        canManage={myRole === "owner"}
        myUserId={session.user.id}
      />
      {(myRole === "owner" || myRole === "admin") && <InvitesSection />}
    </main>
  );
}

function TenantProfileSection({ editable }: { editable: boolean }) {
  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => (await api.GET("/tenant")).data ?? null,
  });
  const [name, setName] = useState<string>();
  const [legalName, setLegalName] = useState<string>();

  if (!tenant) return null;

  const save = async () => {
    const { data } = await api.PATCH("/tenant", {
      body: { name, legalName },
    });
    if (data) {
      queryClient.setQueryData(["tenant"], data);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success(m.settings_saved());
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{m.settings_profile()}</h2>
      <label className="block space-y-1">
        <span className="text-sm font-medium">
          {m.onboarding_company_name()}
        </span>
        <input
          className="w-full rounded-md border px-3 py-2 disabled:opacity-60"
          disabled={!editable}
          value={name ?? tenant.name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.onboarding_legal_name()}</span>
        <input
          className="w-full rounded-md border px-3 py-2 disabled:opacity-60"
          disabled={!editable}
          value={legalName ?? tenant.legalName}
          onChange={(e) => setLegalName(e.target.value)}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        {m.onboarding_costing_hint()}{" "}
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

function MembersSection({
  canManage,
  myUserId,
}: {
  canManage: boolean;
  myUserId: string;
}) {
  const router = useRouter();
  const { data: members, refetch } = useQuery({
    queryKey: ["members"],
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
                <select
                  className="rounded-md border px-2 py-1 text-sm"
                  value={member.role}
                  onChange={(e) =>
                    changeRole(member.userId, e.target.value as Role)
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
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

function InvitesSection() {
  const { data: invites, refetch } = useQuery({
    queryKey: ["invites"],
    queryFn: async () => (await api.GET("/tenant/invites")).data ?? [],
  });
  const [role, setRole] = useState<Role>("warehouse");

  const create = async () => {
    await api.POST("/tenant/invites", { body: { role } });
    await refetch();
  };

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/invite/${token}`,
    );
    toast.success(m.settings_invite_copied());
  };

  const revoke = async (inviteId: string) => {
    await api.DELETE("/tenant/invites/{inviteId}", {
      params: { path: { inviteId } },
    });
    await refetch();
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{m.settings_invites()}</h2>
      <div className="flex items-center gap-2">
        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLES.filter((r) => r !== "owner").map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
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
                  date: new Date(invite.expiresAt).toLocaleDateString("id-ID"),
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
