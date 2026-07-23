import { useQueries } from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { m } from "@/paraglide/messages";

// Fetches all seven document lists filtered to draft only.
// Cached for 2 minutes; small payloads since only drafts are returned.
const DRAFT_QUERIES = [
  {
    queryKey: ["drafts", "purchase-orders"],
    queryFn: async () =>
      (
        await api.GET("/purchase-orders", {
          params: { query: { status: "draft" } },
        })
      ).data?.items ?? [],
  },
  {
    queryKey: ["drafts", "sales-orders"],
    queryFn: async () =>
      (
        await api.GET("/sales-orders", {
          params: { query: { status: "draft" } },
        })
      ).data?.items ?? [],
  },
  {
    queryKey: ["drafts", "goods-receipts"],
    queryFn: async () =>
      (
        await api.GET("/goods-receipts", {
          params: { query: { status: "draft" } },
        })
      ).data?.items ?? [],
  },
  {
    queryKey: ["drafts", "deliveries"],
    queryFn: async () =>
      (await api.GET("/deliveries", { params: { query: { status: "draft" } } }))
        .data?.items ?? [],
  },
  {
    queryKey: ["drafts", "stock-transfers"],
    queryFn: async () =>
      (
        await api.GET("/stock-transfers", {
          params: { query: { status: "draft" } },
        })
      ).data?.items ?? [],
  },
  {
    queryKey: ["drafts", "stock-adjustments"],
    queryFn: async () =>
      (
        await api.GET("/stock-adjustments", {
          params: { query: { status: "draft" } },
        })
      ).data?.items ?? [],
  },
  {
    queryKey: ["drafts", "stock-opnames"],
    queryFn: async () =>
      (
        await api.GET("/stock-opnames", {
          params: { query: { status: "draft" } },
        })
      ).data?.items ?? [],
  },
] as const;

const STALE_MS = 2 * 60 * 1000;

// Pure presentational component - exported for tests.
export function DraftsBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return <SidebarMenuBadge>{count}</SidebarMenuBadge>;
}

// Sidebar nav item with a live draft-count badge linking to the dashboard.
export function DraftsNavButton() {
  const matchRoute = useMatchRoute();
  const isActive = Boolean(matchRoute({ to: "/", fuzzy: false }));

  const results = useQueries({
    queries: DRAFT_QUERIES.map((q) => ({ ...q, staleTime: STALE_MS })),
  });
  const total = results.reduce((sum, r) => sum + (r.data?.length ?? 0), 0);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={m.nav_drafts()}
        render={<Link to="/" />}
      >
        <span>{m.nav_drafts()}</span>
        <DraftsBadge count={total} />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
