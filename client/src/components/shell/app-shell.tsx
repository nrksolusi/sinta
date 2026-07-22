import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import type { TenantOption } from "./tenant-switcher";
import { Topbar } from "./topbar";

// The application shell (UX-D9 / Foundations): collapsible sidebar + topbar
// around the routed content. Tenant switching and sign-out are delegated to
// the caller so all session/mutation behavior stays in the route.
export function AppShell({
  tenants,
  activeTenantId,
  onSwitchTenant,
  userName,
  userEmail,
  onLogout,
  banner,
  children,
}: {
  tenants: TenantOption[];
  activeTenantId: string | null;
  onSwitchTenant: (tenantId: string) => void;
  userName: string;
  userEmail: string;
  onLogout: () => void;
  // Pending-activation notice slot; content wiring stays with the caller.
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Topbar
          tenants={tenants}
          activeTenantId={activeTenantId}
          onSwitchTenant={onSwitchTenant}
          userName={userName}
          userEmail={userEmail}
          onLogout={onLogout}
        />
        {banner}
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
