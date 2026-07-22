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
import {
  partnersQueryOptions,
  productsQueryOptions,
  warehousesQueryOptions,
} from "@/lib/catalog";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/receive")({
  component: ReceivePage,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Goods receipt entry (glossary: "Goods receipt"). Create a draft then post it,
// which is the moment cost enters the journal. Mobile-first single-column form.
function ReceivePage() {
  const router = useRouter();
  const { data: products = [] } = useQuery(productsQueryOptions);
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const { data: suppliers = [] } = useQuery(partnersQueryOptions("supplier"));

  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [docDate, setDocDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DocLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canPost =
    !!supplierId &&
    !!warehouseId &&
    lines.length > 0 &&
    lines.every((l) => Number(l.qty) > 0);

  const post = async () => {
    setSubmitting(true);
    try {
      const body = {
        supplierId,
        warehouseId,
        docDate,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          uom: l.uom,
          qty: l.qty,
          unitCost: l.cost || undefined,
        })),
      };
      const { data: draft } = await api.POST("/goods-receipts", { body });
      if (!draft) {
        toast.error(m.doc_create_failed());
        return;
      }
      const { data: posted } = await api.POST("/goods-receipts/{id}/post", {
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
      <h1 className="text-2xl font-semibold">{m.receive_title()}</h1>

      <div className="space-y-1">
        <Label id="receive-supplier-label">{m.field_supplier()}</Label>
        <SelectField
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          value={supplierId || undefined}
          onValueChange={(value) => value && setSupplierId(value)}
          autoSelectSingle
          placeholder={m.field_select()}
          aria-labelledby="receive-supplier-label"
          className="w-full"
        />
      </div>

      <div className="space-y-1">
        <Label id="receive-warehouse-label">{m.field_warehouse()}</Label>
        <SelectField
          options={warehouses.map((w) => ({
            value: w.id,
            label: `${w.code} - ${w.name}`,
          }))}
          value={warehouseId || undefined}
          onValueChange={(value) => value && setWarehouseId(value)}
          autoSelectSingle
          placeholder={m.field_select()}
          aria-labelledby="receive-warehouse-label"
          className="w-full"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="receive-doc-date">{m.field_doc_date()}</Label>
        <Input
          id="receive-doc-date"
          type="date"
          value={docDate}
          onChange={(e) => setDocDate(e.target.value)}
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{m.field_lines()}</h2>
        <LineEditor
          products={products}
          lines={lines}
          onChange={setLines}
          withCost
          qtyLabel={m.line_qty()}
        />
      </section>

      <div className="space-y-1">
        <Label htmlFor="receive-notes">{m.field_notes()}</Label>
        <Textarea
          id="receive-notes"
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
