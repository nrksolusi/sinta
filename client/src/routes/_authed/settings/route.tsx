import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { activeRole } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsLayout,
});

const navLinkClass =
  "block whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:font-medium [&.active]:text-foreground";

function SettingsLayout() {
  const { session } = Route.useRouteContext();
  const tenantId = session.activeTenantId ?? "";
  const myRole = activeRole(session);

  // key={tenantId} remounts the whole settings tree on tenant switch so no
  // local state or cached data from the previous tenant survives.
  return (
    <main className="mx-auto w-full max-w-4xl p-4" key={tenantId}>
      <h1 className="text-2xl font-semibold">{m.settings_title()}</h1>
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-10">
        <nav
          aria-label={m.settings_title()}
          className="flex shrink-0 flex-row gap-1 overflow-x-auto md:w-44 md:flex-col"
        >
          <Link to="/settings/profile" className={navLinkClass}>
            {m.settings_profile()}
          </Link>
          <Link to="/settings/members" className={navLinkClass}>
            {m.settings_members()}
          </Link>
          {(myRole === "owner" || myRole === "admin") && (
            <Link to="/settings/invites" className={navLinkClass}>
              {m.settings_invites()}
            </Link>
          )}
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </main>
  );
}
