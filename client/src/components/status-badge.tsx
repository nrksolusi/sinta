import { Badge } from "@/components/ui/badge";
import { m } from "@/paraglide/messages";

export type DocumentStatus = "draft" | "posted" | "reversed" | "pending";

// Single source of truth: document status -> id label + palette (design brief
// section B). Callers may not override the color; that keeps status colour
// consistent across every list, badge, and record page.
const STATUS: Record<
  DocumentStatus,
  { label: () => string; className: string }
> = {
  draft: {
    label: () => m.status_draft(),
    className: "bg-muted text-muted-foreground",
  },
  posted: {
    label: () => m.status_posted(),
    className: "bg-success/12 text-success",
  },
  reversed: {
    label: () => m.status_reversed(),
    className: "bg-muted text-muted-foreground line-through",
  },
  pending: {
    label: () => m.status_pending(),
    className: "bg-warning/15 text-warning-foreground",
  },
};

export interface StatusBadgeProps {
  status: DocumentStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, className } = STATUS[status];
  return (
    <Badge variant="secondary" className={className} data-status={status}>
      {label()}
    </Badge>
  );
}

// Exposed so DocList and other callers can render the same label without
// duplicating the mapping.
export function statusLabel(status: DocumentStatus): string {
  return STATUS[status].label();
}
