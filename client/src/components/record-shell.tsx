import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { type DocumentStatus, StatusBadge } from "./status-badge";

export interface BreadcrumbEntry {
  label: ReactNode;
  // Absolute path; when absent the entry renders as the current (non-link)
  // page. Consuming routes pass their TanStack Router paths here.
  to?: string;
}

export interface TimelineEntry {
  action: ReactNode;
  actor: string;
  at: string | number | Date;
}

export interface RecordShellProps {
  breadcrumb: BreadcrumbEntry[];
  // mono doc number or "Draf"; caller supplies the styled node.
  title: ReactNode;
  status: DocumentStatus;
  // Per-state action bar; caller supplies only the legal transitions (UX-D7).
  actions: ReactNode;
  // reversed/pending notice slot.
  banner?: ReactNode;
  timeline: TimelineEntry[];
  children: ReactNode;
}

// Detail-page frame (UX-D1/D7): breadcrumb, title + StatusBadge + action bar,
// optional banner, content sections, and the mini timeline at the bottom in
// every state. Timestamps go through format.ts.
export function RecordShell({
  breadcrumb,
  title,
  status,
  actions,
  banner,
  timeline,
  children,
}: RecordShellProps) {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumb.map((entry, index) => {
            const isLast = index === breadcrumb.length - 1;
            return (
              <Fragment key={entry.to ?? `crumb-${index}`}>
                <BreadcrumbItem>
                  {entry.to && !isLast ? (
                    <BreadcrumbLink href={entry.to}>
                      {entry.label}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{entry.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <StatusBadge status={status} />
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {banner && <div>{banner}</div>}

      <div className="flex flex-col gap-4">{children}</div>

      <Card size="sm" className="mt-2">
        <section aria-labelledby="record-timeline-title" className="px-4">
          <h2 id="record-timeline-title" className="text-sm font-medium">
            {m.record_timeline_title()}
          </h2>
          <ol className="mt-2 flex flex-col gap-1">
            {timeline.map((entry) => (
              <li
                key={`${entry.actor}-${String(entry.at)}`}
                className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"
              >
                <span className="text-foreground">{entry.action}</span>
                <span className="tabular-nums">{formatDate(entry.at)}</span>
              </li>
            ))}
          </ol>
        </section>
      </Card>
    </div>
  );
}
