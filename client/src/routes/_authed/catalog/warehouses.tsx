import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
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

  const editingId = editing !== "new" && editing ? editing.id : null;

  const columns = useMemo<ColumnDef<Warehouse>[]>(
    () => [
      {
        accessorKey: "name",
        header: m.field_warehouse_name(),
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "code",
        header: m.field_warehouse_code(),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setEditing(editingId === row.id ? null : row.original)
              }
            >
              {m.action_edit()}
            </Button>
          </div>
        ),
      },
    ],
    [editingId],
  );

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

      {warehouses.length === 0 && editing !== "new" ? (
        <p className="text-sm text-muted-foreground">{m.catalog_empty()}</p>
      ) : (
        <DataTable
          columns={columns}
          data={warehouses}
          getRowId={(w) => w.id}
          expandedRowId={editingId}
          renderExpandedRow={(warehouse) => (
            <WarehouseForm
              key={warehouse.id}
              warehouse={warehouse}
              onSubmit={save}
              onCancel={() => setEditing(null)}
            />
          )}
        />
      )}
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
  const form = useForm({
    defaultValues: {
      code: warehouse?.code ?? "",
      name: warehouse?.name ?? "",
    },
    onSubmit: async ({ value }) => {
      await onSubmit({ code: value.code, name: value.name });
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.Field name="code">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="warehouse-code">{m.field_warehouse_code()}</Label>
            <Input
              id="warehouse-code"
              required
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="name">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor="warehouse-name">{m.field_warehouse_name()}</Label>
            <Input
              id="warehouse-name"
              required
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <div className="flex gap-2">
        <Button type="submit">{m.action_save()}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.action_cancel()}
        </Button>
      </div>
    </form>
  );
}
