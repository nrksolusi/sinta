import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type DocLine, LineEditor } from "@/components/warehouse/line-editor";
import { api } from "@/lib/api";
import { productsQueryOptions, warehousesQueryOptions } from "@/lib/catalog";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/opname")({
  component: OpnamePage,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Opname count sheet (glossary: "Opname"). Enter the counted quantity per
// product; posting lets the server compute the variance against current stock
// and emit the adjustment movements.
function OpnamePage() {
  const router = useRouter();
  const { data: products = [] } = useQuery(productsQueryOptions);
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);

  const [warehouseId, setWarehouseId] = useState("");
  const [docDate, setDocDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DocLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Counted quantity may legitimately be zero (counted, found none), so only
  // require a warehouse, at least one line, and non-negative numeric counts.
  const canPost =
    !!warehouseId &&
    lines.length > 0 &&
    lines.every((l) => l.qty !== "" && Number(l.qty) >= 0);

  const post = async () => {
    setSubmitting(true);
    try {
      const body = {
        warehouseId,
        docDate,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          uom: l.uom,
          countedQty: l.qty,
        })),
      };
      const { data: draft } = await api.POST("/stock-opnames", { body });
      if (!draft) {
        toast.error(m.doc_create_failed());
        return;
      }
      const { data: posted } = await api.POST("/stock-opnames/{id}/post", {
        params: { path: { id: draft.id } },
      });
      if (!posted) {
        toast.error(m.doc_post_failed());
        return;
      }
      toast.success(m.doc_posted({ number: posted.docNumber ?? "" }));
      await router.navigate({ to: "/" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-lg space-y-5 p-4">
      <h1 className="text-2xl font-semibold">{m.opname_title()}</h1>

      <div className="space-y-1">
        <Label id="opname-warehouse-label">{m.field_warehouse()}</Label>
        <SelectField
          options={warehouses.map((w) => ({
            value: w.id,
            label: `${w.code} - ${w.name}`,
          }))}
          value={warehouseId || undefined}
          onValueChange={(value) => value && setWarehouseId(value)}
          placeholder={m.field_select()}
          aria-labelledby="opname-warehouse-label"
          className="w-full"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="opname-doc-date">{m.field_doc_date()}</Label>
        <Input
          id="opname-doc-date"
          type="date"
          value={docDate}
          onChange={(e) => setDocDate(e.target.value)}
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{m.opname_sheet()}</h2>
        <LineEditor
          products={products}
          lines={lines}
          onChange={setLines}
          qtyLabel={m.opname_counted_qty()}
        />
      </section>

      <div className="space-y-1">
        <Label htmlFor="opname-notes">{m.field_notes()}</Label>
        <Textarea
          id="opname-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button
        className="w-full"
        disabled={!canPost || submitting}
        onClick={post}
      >
        {m.action_post()}
      </Button>
    </main>
  );
}
