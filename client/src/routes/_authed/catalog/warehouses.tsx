import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { Warehouse } from "@/lib/catalog";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/catalog/warehouses")({
  component: WarehousesPage,
});

// The warehouse screens cache the list under ["warehouses"] (lib/catalog.ts).
async function invalidateWarehouses() {
  await queryClient.invalidateQueries({ queryKey: ["warehouses"] });
}

function WarehousesPage() {
  const [editing, setEditing] = useState<Warehouse | "new" | null>(null);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await api.GET("/warehouses");
      return data ?? [];
    },
  });

  const save = async (values: { code: string; name: string }) => {
    const { response, data } =
      editing === "new"
        ? await api.POST("/warehouses", { body: values })
        : await api.PATCH("/warehouses/{warehouseId}", {
            params: { path: { warehouseId: (editing as Warehouse).id } },
            body: values,
          });
    if (!data) {
      toast.error(
        response.status === 409 ? m.catalog_conflict() : m.error_generic(),
      );
      return;
    }
    toast.success(m.settings_saved());
    setEditing(null);
    await invalidateWarehouses();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">{m.catalog_warehouses()}</h2>
        <Button size="sm" onClick={() => setEditing("new")}>
          {m.catalog_add_warehouse()}
        </Button>
      </div>

      {editing === "new" && (
        <div className="rounded-md border p-4">
          <WarehouseForm onSubmit={save} onCancel={() => setEditing(null)} />
        </div>
      )}

      {warehouses.length === 0 && editing !== "new" && (
        <p className="text-sm text-muted-foreground">{m.catalog_empty()}</p>
      )}

      <ul className="divide-y rounded-md border empty:hidden">
        {warehouses.map((warehouse) => (
          <li key={warehouse.id} className="space-y-3 p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{warehouse.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {warehouse.code}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditing(
                    editing !== "new" && editing?.id === warehouse.id
                      ? null
                      : warehouse,
                  )
                }
              >
                {m.action_edit()}
              </Button>
            </div>
            {editing !== "new" && editing?.id === warehouse.id && (
              <div className="rounded-md border p-4">
                <WarehouseForm
                  key={warehouse.id}
                  warehouse={editing}
                  onSubmit={save}
                  onCancel={() => setEditing(null)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function WarehouseForm({
  warehouse,
  onSubmit,
  onCancel,
}: {
  warehouse?: Warehouse;
  onSubmit: (values: { code: string; name: string }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(warehouse?.code ?? "");
  const [name, setName] = useState(warehouse?.name ?? "");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ code, name });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="warehouse-code">{m.field_warehouse_code()}</Label>
        <Input
          id="warehouse-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="warehouse-name">{m.field_warehouse_name()}</Label>
        <Input
          id="warehouse-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit">{m.action_save()}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.action_cancel()}
        </Button>
      </div>
    </form>
  );
}
