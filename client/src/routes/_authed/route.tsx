import {
  createFileRoute,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/shell/app-shell";
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

  // A user with no memberships only ever sees the onboarding wizard - no nav,
  // no tenant switcher (there is nothing to switch to). Keep a minimal frame
  // with just app name and sign-out, as the old layout did.
  if (session.memberships.length === 0) {
    return (
      <div className="min-h-svh">
        <header className="flex items-center gap-4 border-b px-4 py-2">
          <span className="font-semibold">{m.app_name()}</span>
          <span className="ml-auto text-sm text-muted-foreground">
            {m.tenant_none()}
          </span>
          <Button variant="outline" size="sm" onClick={logout}>
            {m.logout()}
          </Button>
        </header>
        <Outlet />
      </div>
    );
  }

  const banner =
    activeTenant && !activeTenant.active ? (
      <p className="border-b bg-warning/15 px-4 py-2 text-sm text-warning-foreground">
        {m.tenant_inactive_banner()}
      </p>
    ) : undefined;

  return (
    <AppShell
      tenants={session.memberships.map(({ tenant }) => ({
        id: tenant.id,
        name: tenant.name,
      }))}
      activeTenantId={session.activeTenantId ?? null}
      onSwitchTenant={switchTenant}
      userName={session.user.name}
      userEmail={session.user.email}
      onLogout={logout}
      banner={banner}
    >
      <Outlet />
    </AppShell>
  );
}
