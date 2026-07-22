import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import type { DashboardDoc } from "./documents";

// Route targets are built by other engineers and may 404 until their wave
// lands; we link anyway (task brief).
type LinkPath = string & {};

// Compact "Dokumen terbaru" table: the newest documents across every kind, each
// row linking to its detail page. Kept as a plain table (not DocList) because
// this is a cross-type digest, not a filterable single-type list.
export function RecentDocs({ docs }: { docs: DashboardDoc[] }) {
  if (docs.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title={m.dashboard_recent_empty_title()}
        description={m.dashboard_recent_empty_description()}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.dashboard_recent_col_number()}</TableHead>
          <TableHead>{m.dashboard_recent_col_type()}</TableHead>
          <TableHead>{m.dashboard_recent_col_counterparty()}</TableHead>
          <TableHead>{m.dashboard_recent_col_date()}</TableHead>
          <TableHead>{m.dashboard_recent_col_status()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {docs.map((doc) => (
          <TableRow key={doc.id}>
            <TableCell className="font-mono tabular-nums">
              <Link
                to={doc.to as LinkPath}
                className="underline-offset-4 hover:underline"
              >
                {doc.number ?? m.status_draft()}
              </Link>
            </TableCell>
            <TableCell>{doc.typeLabel}</TableCell>
            <TableCell className="max-w-56 truncate">
              {doc.counterparty}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {formatDate(doc.date)}
            </TableCell>
            <TableCell>
              <StatusBadge status={doc.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
