import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type DocLine, LineEditor } from "@/components/warehouse/line-editor";
import { api } from "@/lib/api";
import {
  partnersQueryOptions,
  productsQueryOptions,
  warehousesQueryOptions,
} from "@/lib/catalog";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/delivery")({
  component: DeliveryPage,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Delivery entry (glossary: "Delivery"; Indonesian "surat jalan"). Create a
// draft then post it, which issues stock out of the warehouse.
function DeliveryPage() {
  const router = useRouter();
  const { data: products = [] } = useQuery(productsQueryOptions);
  const { data: warehouses = [] } = useQuery(warehousesQueryOptions);
  const { data: customers = [] } = useQuery(partnersQueryOptions("customer"));

  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [docDate, setDocDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DocLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canPost =
    !!customerId &&
    !!warehouseId &&
    lines.length > 0 &&
    lines.every((l) => Number(l.qty) > 0);

  const post = async () => {
    setSubmitting(true);
    try {
      const body = {
        customerId,
        warehouseId,
        docDate,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          uom: l.uom,
          qty: l.qty,
        })),
      };
      const { data: draft } = await api.POST("/deliveries", { body });
      if (!draft) {
        toast.error(m.doc_create_failed());
        return;
      }
      const { data: posted } = await api.POST("/deliveries/{id}/post", {
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
      <h1 className="text-2xl font-semibold">{m.delivery_title()}</h1>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.field_customer()}</span>
        <select
          className="w-full rounded-md border px-3 py-2"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="" disabled>
            {m.field_select()}
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.field_warehouse()}</span>
        <select
          className="w-full rounded-md border px-3 py-2"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
        >
          <option value="" disabled>
            {m.field_select()}
          </option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} - {w.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.field_doc_date()}</span>
        <input
          className="w-full rounded-md border px-3 py-2"
          type="date"
          value={docDate}
          onChange={(e) => setDocDate(e.target.value)}
        />
      </label>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{m.field_lines()}</h2>
        <LineEditor
          products={products}
          lines={lines}
          onChange={setLines}
          qtyLabel={m.line_qty()}
        />
      </section>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{m.field_notes()}</span>
        <textarea
          className="w-full rounded-md border px-3 py-2"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

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
