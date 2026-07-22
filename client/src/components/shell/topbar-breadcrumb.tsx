import { useMatchRoute } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { m } from "@/paraglide/messages";
import { dashboardItem, navGroups, settingsItem } from "./nav-config";

interface Crumb {
  label: string;
}

// Derives the breadcrumb trail from the nav config: "Group / Item" for grouped
// pages, a single crumb for Dashboard/Settings. Deep pages (detail/new) still
// resolve to their section here; per-record crumbs are the record page's job
// (RecordShell, task 0.3).
function useBreadcrumbs(): Crumb[] {
  const matchRoute = useMatchRoute();

  if (matchRoute({ to: dashboardItem.to, fuzzy: false })) {
    return [{ label: dashboardItem.label() }];
  }

  for (const group of navGroups) {
    for (const item of group.items) {
      if (matchRoute({ to: item.to, fuzzy: true })) {
        return [{ label: group.label() }, { label: item.label() }];
      }
    }
  }

  if (matchRoute({ to: settingsItem.to, fuzzy: true })) {
    return [{ label: settingsItem.label() }];
  }

  return [{ label: m.app_name() }];
}

export function TopbarBreadcrumb() {
  const crumbs = useBreadcrumbs();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <BreadcrumbItem key={crumb.label}>
              {isLast ? (
                <BreadcrumbPage className="font-medium">
                  {crumb.label}
                </BreadcrumbPage>
              ) : (
                <>
                  <span>{crumb.label}</span>
                  <BreadcrumbSeparator />
                </>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
