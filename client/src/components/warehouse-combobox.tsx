import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
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
}

// Warehouse picker: same skeleton, row is name / mono code.
export function WarehouseCombobox(props: WarehouseComboboxProps) {
  if (props.onSearch) {
    return <WarehouseComboboxBody {...props} searcher={props.onSearch} />;
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

  return <WarehouseComboboxBody {...props} searcher={searcher} />;
}

function WarehouseComboboxBody({
  value,
  onSelect,
  disabled,
  searcher,
}: WarehouseComboboxProps & { searcher: Searcher<Warehouse> }) {
  return (
    <ComboboxCore<Warehouse>
      value={value}
      onSelect={onSelect}
      disabled={disabled}
      searcher={searcher}
      placeholder={m.combobox_search_warehouse()}
      resultsLabel={m.combobox_results()}
    />
  );
}
