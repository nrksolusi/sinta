import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { m } from "@/paraglide/messages";
import {
  dashboardItem,
  type NavItem,
  navGroups,
  settingsItem,
} from "./nav-config";

// A single nav row. Active highlight uses the router match so it survives
// tenant switches and deep links; `fuzzy` matches nested detail/new routes
// (e.g. /purchases/receipts/$id highlights "Penerimaan Barang").
function NavMenuItem({ item, exact }: { item: NavItem; exact?: boolean }) {
  const matchRoute = useMatchRoute();
  const isActive = Boolean(matchRoute({ to: item.to, fuzzy: !exact }));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={item.label()}
        render={<Link to={item.to} />}
      >
        <span>{item.label()}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-8 items-center px-2 font-semibold">
          {m.app_name()}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Dashboard is "/", so it must match exactly, not fuzzily. */}
              <NavMenuItem item={dashboardItem} exact />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {navGroups.map((group) => (
          <SidebarGroup key={group.label()}>
            <SidebarGroupLabel>{group.label()}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavMenuItem key={item.to} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <NavMenuItem item={settingsItem} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
