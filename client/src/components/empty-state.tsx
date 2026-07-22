import { InboxIcon, SearchXIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  // first-use = the collection has never had data; filtered = data exists but
  // the active filters exclude all of it. Callers pick based on filter state so
  // the copy and default icon match the situation (UX-D10).
  variant: "first-use" | "filtered";
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({
  variant,
  title,
  description,
  action,
  icon,
}: EmptyStateProps) {
  const defaultIcon =
    variant === "filtered" ? (
      <SearchXIcon aria-hidden className="size-6 text-muted-foreground" />
    ) : (
      <InboxIcon aria-hidden className="size-6 text-muted-foreground" />
    );

  return (
    <div
      data-testid="empty-state"
      data-variant={variant}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        {icon ?? defaultIcon}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
