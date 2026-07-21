import { createFileRoute } from "@tanstack/react-router";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/")({
  component: Dashboard,
});

function Dashboard() {
  const { session } = Route.useRouteContext();

  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">
        {m.dashboard_welcome({ name: session.user.name })}
      </h1>
      {!session.activeTenantId && (
        <p className="mt-2 text-muted-foreground">
          {m.dashboard_pick_tenant()}
        </p>
      )}
    </main>
  );
}
