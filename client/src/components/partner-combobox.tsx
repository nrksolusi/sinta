import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Partner } from "@/lib/pickers-data";
import {
  partnerToOption,
  pickerPartnersQueryOptions,
} from "@/lib/pickers-data";
import { m } from "@/paraglide/messages";
import { ComboboxCore, type Searcher } from "./combobox";

export interface PartnerComboboxProps {
  value?: string;
  onSelect: (partner: Partner) => void;
  disabled?: boolean;
  // Filters the internal fetch to suppliers or customers. Ignored when a custom
  // onSearch is supplied.
  role?: "supplier" | "customer";
  onSearch?: Searcher<Partner>;
}

// Partner picker: same skeleton as ProductCombobox with a simpler row (name /
// mono code, no stock column).
export function PartnerCombobox(props: PartnerComboboxProps) {
  if (props.onSearch) {
    return <PartnerComboboxBody {...props} searcher={props.onSearch} />;
  }
  return <PartnerComboboxDefault {...props} />;
}

function PartnerComboboxDefault(props: PartnerComboboxProps) {
  const { data: partners = [] } = useQuery(
    pickerPartnersQueryOptions(props.role ?? "supplier"),
  );

  const searcher = useCallback<Searcher<Partner>>(
    (query) => {
      const q = query.trim().toLowerCase();
      const matches =
        q === ""
          ? partners
          : partners.filter(
              (p) =>
                p.name.toLowerCase().includes(q) ||
                (p.code ?? "").toLowerCase().includes(q),
            );
      return Promise.resolve(matches.map(partnerToOption));
    },
    [partners],
  );

  return <PartnerComboboxBody {...props} searcher={searcher} />;
}

function PartnerComboboxBody({
  value,
  onSelect,
  disabled,
  searcher,
}: PartnerComboboxProps & { searcher: Searcher<Partner> }) {
  return (
    <ComboboxCore<Partner>
      value={value}
      onSelect={onSelect}
      disabled={disabled}
      searcher={searcher}
      placeholder={m.combobox_search_partner()}
      resultsLabel={m.combobox_results()}
    />
  );
}
