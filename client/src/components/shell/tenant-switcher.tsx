import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export interface TenantOption {
  id: string;
  name: string;
}

// Searchable tenant switcher (UX-D5: the tenant switcher is a combobox).
// Presentation only - the switch action (mutation + cache invalidation) is
// owned by the caller and passed as `onSwitch`, so the old raw-<select>
// behavior is preserved unchanged.
export function TenantSwitcher({
  tenants,
  activeTenantId,
  onSwitch,
}: {
  tenants: TenantOption[];
  activeTenantId: string | null;
  onSwitch: (tenantId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = tenants.find((t) => t.id === activeTenantId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="default"
            aria-label={m.tenant_select_label()}
            className="h-8 max-w-56 justify-between gap-2"
          />
        }
      >
        <span className="truncate">{active?.name ?? "-"}</span>
        <ChevronsUpDownIcon className="opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end">
        <Command>
          <CommandInput placeholder={m.shell_tenant_switch_search()} />
          <CommandList>
            <CommandEmpty>{m.shell_tenant_switch_empty()}</CommandEmpty>
            <CommandGroup>
              {tenants.map((tenant) => (
                <CommandItem
                  key={tenant.id}
                  value={tenant.name}
                  onSelect={() => {
                    setOpen(false);
                    if (tenant.id !== activeTenantId) onSwitch(tenant.id);
                  }}
                >
                  <span className="truncate">{tenant.name}</span>
                  <CheckIcon
                    className={cn(
                      "ml-auto",
                      tenant.id === activeTenantId
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
