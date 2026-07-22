import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { sessionQueryOptions } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const session = await queryClient.ensureQueryData(sessionQueryOptions);
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    // A user with no memberships has nothing to see except the wizard.
    if (
      session.memberships.length === 0 &&
      location.pathname !== "/onboarding"
    ) {
      throw redirect({ to: "/onboarding" });
    }
    return { session };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { session } = Route.useRouteContext();
  const router = useRouter();
  const activeTenant = session.memberships.find(
    (mb) => mb.tenant.id === session.activeTenantId,
  )?.tenant;

  const switchTenant = async (tenantId: string) => {
    const { data } = await api.POST("/auth/switch-tenant", {
      body: { tenantId },
    });
    if (!data) {
      toast.error(m.error_generic());
      return;
    }
    queryClient.setQueryData(["session"], data);
    // Drop every tenant-scoped cache so no page renders the old tenant's data.
    await queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== "session",
    });
    await router.invalidate();
  };

  const logout = async () => {
    await api.POST("/auth/logout");
    queryClient.setQueryData(["session"], null);
    await router.navigate({ to: "/login", search: { redirect: undefined } });
  };

  return (
    <div className="min-h-svh">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <span className="font-semibold">{m.app_name()}</span>
        {session.memberships.length > 0 && (
          <nav className="flex gap-3 text-sm">
            <Link to="/" className="[&.active]:font-semibold">
              {m.nav_dashboard()}
            </Link>
            <Link to="/receive" className="[&.active]:font-semibold">
              {m.nav_receive()}
            </Link>
            <Link to="/delivery" className="[&.active]:font-semibold">
              {m.nav_delivery()}
            </Link>
            <Link to="/opname" className="[&.active]:font-semibold">
              {m.nav_opname()}
            </Link>
            <Link to="/settings" className="[&.active]:font-semibold">
              {m.nav_settings()}
            </Link>
          </nav>
        )}

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
      {activeTenant && !activeTenant.active && (
        <p className="border-b bg-amber-100 px-4 py-2 text-sm text-amber-900">
          {m.tenant_inactive_banner()}
        </p>
      )}
      <Outlet />
    </div>
  );
}
