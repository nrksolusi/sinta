import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/catalog")({
  component: CatalogLayout,
});

const navLinkClass =
  "block whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:font-medium [&.active]:text-foreground";

function CatalogLayout() {
  const { session } = Route.useRouteContext();
  const tenantId = session.activeTenantId ?? "";

  // key={tenantId} remounts the whole catalog tree on tenant switch so no
  // local state or cached data from the previous tenant survives.
  return (
    <main className="mx-auto w-full max-w-4xl p-4" key={tenantId}>
      <h1 className="text-2xl font-semibold">{m.catalog_title()}</h1>
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-10">
        <nav
          aria-label={m.catalog_title()}
          className="flex shrink-0 flex-row gap-1 overflow-x-auto md:w-44 md:flex-col"
        >
          <Link to="/catalog/products" className={navLinkClass}>
            {m.catalog_products()}
          </Link>
          <Link to="/catalog/partners" className={navLinkClass}>
            {m.catalog_partners()}
          </Link>
          <Link to="/catalog/warehouses" className={navLinkClass}>
            {m.catalog_warehouses()}
          </Link>
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </main>
  );
}
