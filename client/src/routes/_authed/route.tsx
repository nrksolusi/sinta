import {
  createFileRoute,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { sessionQueryOptions } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed")({
  ssr: false,
  beforeLoad: async () => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions);
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { session } = Route.useRouteContext();
  const router = useRouter();

  const switchTenant = async (tenantId: string) => {
    const { data } = await api.POST("/auth/switch-tenant", {
      body: { tenantId },
    });
    if (data) {
      queryClient.setQueryData(["session"], data);
      await router.invalidate();
    }
  };

  const logout = async () => {
    await api.POST("/auth/logout");
    queryClient.setQueryData(["session"], null);
    await router.navigate({ to: "/login" });
  };

  return (
    <div className="min-h-svh">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <span className="font-semibold">{m.app_name()}</span>

        {session.memberships.length > 0 ? (
          <label className="ml-auto flex items-center gap-2 text-sm">
            {m.tenant_select_label()}
            <select
              className="rounded-md border px-2 py-1"
              value={session.activeTenantId ?? ""}
              onChange={(e) => switchTenant(e.target.value)}
            >
              <option value="" disabled>
                -
              </option>
              {session.memberships.map(({ tenant }) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="ml-auto text-sm text-muted-foreground">
            {m.tenant_none()}
          </span>
        )}

        <Button variant="outline" size="sm" onClick={logout}>
          {m.logout()}
        </Button>
      </header>
      <Outlet />
    </div>
  );
}
