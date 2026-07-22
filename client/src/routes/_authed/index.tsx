import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  type DocKind,
  draftDocs,
  type RawDocLists,
  recentDocs,
  toDashboardDocs,
} from "@/components/dashboard/documents";
import { DraftList } from "@/components/dashboard/draft-list";
import { RecentDocs } from "@/components/dashboard/recent-docs";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/")({
  component: Dashboard,
});

const RECENT_LIMIT = 10;

// Route targets built by other engineers; may 404 until their wave lands
// (task brief). Escape-hatch string type mirrors nav-config's NavPath.
type LinkPath = string & {};

// Each document kind's list endpoint. Lists have no filters/pagination at
// pilot scale (design doc "API gaps" #3), so we fetch each in full and union
// client-side.
const DOC_LISTS: {
  kind: DocKind;
  key: string;
  fetch: () => Promise<unknown[]>;
}[] = [
  {
    kind: "goodsReceipt",
    key: "goods-receipts",
    fetch: async () => (await api.GET("/goods-receipts")).data ?? [],
  },
  {
    kind: "delivery",
    key: "deliveries",
    fetch: async () => (await api.GET("/deliveries")).data ?? [],
  },
  {
    kind: "purchaseOrder",
    key: "purchase-orders",
    fetch: async () => (await api.GET("/purchase-orders")).data ?? [],
  },
  {
    kind: "salesOrder",
    key: "sales-orders",
    fetch: async () => (await api.GET("/sales-orders")).data ?? [],
  },
  {
    kind: "stockTransfer",
    key: "stock-transfers",
    fetch: async () => (await api.GET("/stock-transfers")).data ?? [],
  },
  {
    kind: "stockAdjustment",
    key: "stock-adjustments",
    fetch: async () => (await api.GET("/stock-adjustments")).data ?? [],
  },
  {
    kind: "stockOpname",
    key: "stock-opnames",
    fetch: async () => (await api.GET("/stock-opnames")).data ?? [],
  },
];

function Dashboard() {
  const { session } = Route.useRouteContext();

  const { data: products = [] } = useQuery({
    queryKey: ["dashboard", "products"],
    queryFn: async () => (await api.GET("/products")).data ?? [],
  });
  const { data: partners = [] } = useQuery({
    queryKey: ["dashboard", "partners"],
    queryFn: async () => (await api.GET("/partners")).data ?? [],
  });
  const { data: warehouses = [] } = useQuery({
    queryKey: ["dashboard", "warehouses"],
    queryFn: async () => (await api.GET("/warehouses")).data ?? [],
  });
  const { data: valuation } = useQuery({
    queryKey: ["dashboard", "stock-valuation"],
    queryFn: async () =>
      (await api.GET("/reports/stock-valuation")).data ?? null,
  });

  const docQueries = useQueries({
    queries: DOC_LISTS.map((list) => ({
      queryKey: ["dashboard", list.key],
      queryFn: list.fetch,
    })),
  });

  const docs = useMemo(() => {
    const lists: RawDocLists = {};
    DOC_LISTS.forEach((list, i) => {
      // biome-ignore lint/suspicious/noExplicitAny: raw list narrowed in normalizer
      lists[list.kind] = (docQueries[i].data ?? []) as any;
    });
    return toDashboardDocs(lists, partners, warehouses);
  }, [docQueries, partners, warehouses]);

  const drafts = useMemo(() => draftDocs(docs), [docs]);
  const recent = useMemo(() => recentDocs(docs, RECENT_LIMIT), [docs]);

  if (!session.activeTenantId) {
    return (
      <main className="p-4 md:p-6">
        <h1 className="text-xl font-semibold">
          {m.dashboard_welcome({ name: session.user.name })}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {m.dashboard_pick_tenant()}
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {m.dashboard_welcome({ name: session.user.name })}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link
            to={"/purchases/receipts/new" as LinkPath}
            className={buttonVariants({ size: "lg" })}
          >
            {m.dashboard_action_new_receipt()}
          </Link>
          <Link
            to={"/sales/deliveries/new" as LinkPath}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {m.dashboard_action_new_delivery()}
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.dashboard_drafts_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <DraftList drafts={drafts} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={m.dashboard_stat_products()}
          value={formatNumber(products.length)}
        />
        <StatCard
          label={m.dashboard_stat_partners()}
          value={formatNumber(partners.length)}
        />
        <StatCard
          label={m.dashboard_stat_warehouses()}
          value={formatNumber(warehouses.length)}
        />
        <StatCard
          label={m.dashboard_stat_valuation()}
          value={valuation ? formatCurrency(valuation.totalValue) : "-"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.dashboard_recent_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentDocs docs={recent} />
        </CardContent>
      </Card>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}
