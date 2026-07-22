import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { m } from "@/paraglide/messages";
import { type TenantOption, TenantSwitcher } from "./tenant-switcher";
import { TopbarBreadcrumb } from "./topbar-breadcrumb";
import { UserMenu } from "./user-menu";

// Sticky topbar: sidebar toggle + breadcrumb (left), tenant switcher + user
// menu (right). Toolbar controls are h-8 per the design brief.
export function Topbar({
  tenants,
  activeTenantId,
  onSwitchTenant,
  userName,
  userEmail,
  onLogout,
}: {
  tenants: TenantOption[];
  activeTenantId: string | null;
  onSwitchTenant: (tenantId: string) => void;
  userName: string;
  userEmail: string;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger aria-label={m.shell_toggle_sidebar()} />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <TopbarBreadcrumb />
      <div className="ml-auto flex items-center gap-2">
        {tenants.length > 0 ? (
          <TenantSwitcher
            tenants={tenants}
            activeTenantId={activeTenantId}
            onSwitch={onSwitchTenant}
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            {m.tenant_none()}
          </span>
        )}
        <UserMenu name={userName} email={userEmail} onLogout={onLogout} />
      </div>
    </header>
  );
}
