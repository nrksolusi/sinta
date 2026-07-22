import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import type { DashboardDoc } from "./documents";

// Route targets are built by other engineers and may 404 until their wave
// lands; we link anyway (task brief). The escape-hatch string type mirrors
// nav-config's NavPath.
type LinkPath = string & {};

// The "Draf saya" resume surface (UX-D2). Each row restates the doc so the user
// recognises what they left unfinished, and "Lanjutkan" reopens it editable.
export function DraftList({ drafts }: { drafts: DashboardDoc[] }) {
  if (drafts.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title={m.dashboard_drafts_empty_title()}
        description={m.dashboard_drafts_empty_description()}
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y">
      {drafts.map((draft) => (
        <li
          key={draft.id}
          className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
        >
          <span className="min-w-0 truncate text-sm">
            {m.dashboard_draft_summary({
              type: draft.typeLabel,
              counterparty: draft.counterparty,
              count: draft.lineCount,
            })}
          </span>
          <Link
            to={draft.to as LinkPath}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {m.dashboard_drafts_resume()}
          </Link>
        </li>
      ))}
    </ul>
  );
}
