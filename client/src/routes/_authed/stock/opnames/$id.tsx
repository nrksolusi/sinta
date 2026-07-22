import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { RecordShell, type TimelineEntry } from "@/components/record-shell";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { productsQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages";
import {
  badgeStatus,
  opnameQueryOptions,
  productFactsById,
} from "./-opname-data";
import { OpnameFlow } from "./-opname-flow";
import { resumeSheet } from "./-opname-sheet";

type StockOpname = components["schemas"]["StockOpname"];
type StockOnHandRow = components["schemas"]["StockOnHandRow"];

export const Route = createFileRoute("/_authed/stock/opnames/$id")({
  component: OpnameDetailPage,
});

function OpnameDetailPage() {
  const { id } = Route.useParams();
  const { data: opname, isPending } = useQuery(opnameQueryOptions(id));

  if (isPending) {
    return (
      <div className="p-4 md:p-6">
        <div
          className="h-40 animate-pulse rounded-md bg-muted"
          aria-busy="true"
        />
      </div>
    );
  }

  if (!opname) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          variant="first-use"
          title={m.opname_breadcrumb_list()}
          description={m.doc_create_failed()}
        />
      </div>
    );
  }

  // A draft resumes into the count-sheet flow; posted/reversed render read-only.
  if (opname.status === "draft") {
    return <DraftResume opname={opname} />;
  }
  return <PostedDetail opname={opname} />;
}

// Regenerate the sheet from current stock-on-hand, overlay the saved counts,
// and hand it to the flow at the count step so the user picks up where they
// left off (UX-D2).
function DraftResume({ opname }: { opname: StockOpname }) {
  const { data: products = [] } = useQuery(productsQueryOptions);
  const { data: soh = [], isPending } = useQuery({
    queryKey: ["stock-on-hand", opname.warehouseId],
    queryFn: async (): Promise<StockOnHandRow[]> => {
      const { data } = await api.GET("/reports/stock-on-hand", {
        params: { query: { warehouseId: opname.warehouseId } },
      });
      return data?.rows ?? [];
    },
  });

  if (isPending || products.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <div
          className="h-40 animate-pulse rounded-md bg-muted"
          aria-busy="true"
        />
      </div>
    );
  }

  const sheet = resumeSheet(opname, soh, productFactsById(products));

  return (
    <OpnameFlow
      initial={{
        opnameId: opname.id,
        warehouseId: opname.warehouseId,
        docDate: opname.docDate,
        notes: opname.notes,
        sheet,
        step: "count",
      }}
    />
  );
}

function PostedDetail({ opname }: { opname: StockOpname }) {
  const { data: products = [] } = useQuery(productsQueryOptions);
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);

  const facts = productFactsById(products);
  const warehouse = warehouses.find((w) => w.id === opname.warehouseId);
  const reversed = opname.status === "reversed";

  const timeline: TimelineEntry[] = [
    { action: m.opname_timeline_created(), actor: "", at: opname.docDate },
  ];
  if (opname.status === "posted" || reversed) {
    timeline.unshift({
      action: m.opname_timeline_posted(),
      actor: "",
      at: opname.docDate,
    });
  }

  return (
    <RecordShell
      breadcrumb={[
        { label: m.opname_breadcrumb_stock() },
        { label: m.opname_breadcrumb_list(), to: "/stock/opnames" },
        {
          label: (
            <span className="font-mono">
              {opname.docNumber ?? m.status_draft()}
            </span>
          ),
        },
      ]}
      title={
        <span className="font-mono">
          {opname.docNumber ?? m.status_draft()}
        </span>
      }
      status={badgeStatus(opname.status)}
      actions={null}
      banner={
        reversed && opname.reversedById ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {m.opname_reversed_banner({ number: opname.reversedById })}
          </div>
        ) : opname.reversesId ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {m.opname_reverses_banner({ number: opname.reversesId })}
          </div>
        ) : undefined
      }
      timeline={timeline}
    >
      <Card size="sm" className="px-4">
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <span>
            {m.field_warehouse()}:{" "}
            <span className="font-mono">{warehouse?.code ?? ""}</span>{" "}
            {warehouse?.name ?? ""}
          </span>
        </div>
      </Card>

      {/* API gap: opname lines return countedQty only; the posted variance
          lives in the journal. Show the counts and link to kartu stok per
          product for the movements produced (docs/plans/fix-2 API gaps #1). */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">
            {m.opname_posted_sheet_title()}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {m.opname_posted_variance_gap()}
        </p>
        <div className="overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.opname_col_product()}</TableHead>
                <TableHead className="text-right">
                  {m.opname_col_physical()}
                </TableHead>
                <TableHead className="text-right">
                  {m.opname_kartu_stok()}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opname.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{facts.get(line.productId)?.name ?? ""}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {facts.get(line.productId)?.sku ?? line.productId}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(line.countedQty)} {line.uom}
                  </TableCell>
                  <TableCell className="text-right">
                    <a
                      className="text-sm underline underline-offset-4"
                      href={`/reports/stock-card?productId=${line.productId}`}
                    >
                      {m.opname_kartu_stok()}
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!reversed && (
          <p className="text-xs text-muted-foreground">
            {m.opname_posted_note()}
          </p>
        )}
      </section>
    </RecordShell>
  );
}
