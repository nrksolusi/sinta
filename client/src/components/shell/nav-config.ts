import { m } from "@/paraglide/messages";
import type { FileRouteTypes } from "@/routeTree.gen";

// Route targets follow the fix-2 route map (docs/plans/fix-2-ui-redesign.md).
// Some routes are built by other engineers and may 404 until merged; they are
// still linked here per the task brief.
type NavPath = FileRouteTypes["to"] | (string & {});

export interface NavItem {
  label: () => string;
  to: NavPath;
}

export interface NavGroup {
  label: () => string;
  items: NavItem[];
}

// Top-level standalone item (Dashboard), rendered above the groups.
export const dashboardItem: NavItem = {
  label: () => m.nav_dashboard(),
  to: "/",
};

// UX-D9: navigation grouped by business flow. Labels are Indonesian via
// Paraglide; order is exactly as the plan lists it.
export const navGroups: NavGroup[] = [
  {
    label: () => m.nav_group_purchases(),
    items: [
      { label: () => m.nav_purchase_orders(), to: "/purchases/orders" },
      { label: () => m.nav_goods_receipts(), to: "/purchases/receipts" },
    ],
  },
  {
    label: () => m.nav_group_sales(),
    items: [
      { label: () => m.nav_sales_orders(), to: "/sales/orders" },
      { label: () => m.nav_deliveries(), to: "/sales/deliveries" },
    ],
  },
  {
    label: () => m.nav_group_stock(),
    items: [
      { label: () => m.nav_stock_transfers(), to: "/stock/transfers" },
      { label: () => m.nav_stock_adjustments(), to: "/stock/adjustments" },
      { label: () => m.nav_stock_opnames(), to: "/stock/opnames" },
    ],
  },
  {
    label: () => m.nav_group_reports(),
    items: [
      {
        label: () => m.nav_report_stock_on_hand(),
        to: "/reports/stock-on-hand",
      },
      { label: () => m.nav_report_stock_card(), to: "/reports/stock-card" },
      { label: () => m.nav_report_valuation(), to: "/reports/valuation" },
    ],
  },
  {
    label: () => m.nav_group_catalog(),
    items: [
      { label: () => m.nav_catalog_products(), to: "/catalog/products" },
      { label: () => m.nav_catalog_partners(), to: "/catalog/partners" },
      { label: () => m.nav_catalog_warehouses(), to: "/catalog/warehouses" },
    ],
  },
];

// Pinned to the bottom of the sidebar.
export const settingsItem: NavItem = {
  label: () => m.nav_settings(),
  to: "/settings",
};
