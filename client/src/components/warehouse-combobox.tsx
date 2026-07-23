import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { PickerDialog } from "@/lib/picker-dialog";
import type { Warehouse } from "@/lib/pickers-data";
import {
  pickerWarehousesQueryOptions,
  warehouseToOption,
} from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";
import { ComboboxCore, type Searcher } from "./combobox";

export interface WarehouseComboboxProps {
  value?: string;
  onSelect: (warehouse: Warehouse) => void;
  disabled?: boolean;
  onSearch?: Searcher<Warehouse>;
  // Display name for the trigger button. When absent, resolved from the local
  // warehouse list.
  selectedLabel?: string;
}

// Warehouse picker: same skeleton, row is name / mono code.
export function WarehouseCombobox(props: WarehouseComboboxProps) {
  if (props.onSearch) {
    return (
      <WarehouseComboboxBody
        {...props}
        searcher={props.onSearch}
        warehouses={[]}
      />
    );
  }
  return <WarehouseComboboxDefault {...props} />;
}

function WarehouseComboboxDefault(props: WarehouseComboboxProps) {
  const { data: warehouses = [] } = useQuery(pickerWarehousesQueryOptions);

  const searcher = useCallback<Searcher<Warehouse>>(
    (query) => {
      const q = query.trim().toLowerCase();
      const matches =
        q === ""
          ? warehouses
          : warehouses.filter(
              (w) =>
                w.name.toLowerCase().includes(q) ||
                w.code.toLowerCase().includes(q),
            );
      return Promise.resolve(matches.map(warehouseToOption));
    },
    [warehouses],
  );

  const resolvedLabel =
    props.selectedLabel ??
    (props.value
      ? warehouses.find((w) => w.id === props.value)?.name
      : undefined);

  return (
    <WarehouseComboboxBody
      {...props}
      searcher={searcher}
      warehouses={warehouses}
      selectedLabel={resolvedLabel}
    />
  );
}

function WarehouseComboboxBody({
  value,
  onSelect,
  disabled,
  searcher,
  selectedLabel,
}: WarehouseComboboxProps & {
  searcher: Searcher<Warehouse>;
  warehouses: Warehouse[];
}) {
  return (
    <PickerDialog
      label={m.picker_select_warehouse()}
      selectedLabel={selectedLabel}
      disabled={disabled}
    >
      <ComboboxCore<Warehouse>
        value={value}
        onSelect={onSelect}
        disabled={disabled}
        searcher={searcher}
        placeholder={m.combobox_search_warehouse()}
        resultsLabel={m.combobox_results()}
      />
    </PickerDialog>
  );
}
