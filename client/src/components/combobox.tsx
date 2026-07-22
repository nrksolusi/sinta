import { useEffect, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Option } from "@/lib/pickers-data";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

// Async seam shared by every picker: given a query, resolve the options to
// show. Empty query is a valid call (returns recents / the full list).
export type Searcher<T> = (query: string) => Promise<Option<T>[]>;

export interface ComboboxCoreProps<T> {
  value?: string;
  onSelect: (value: T) => void;
  disabled?: boolean;
  searcher: Searcher<T>;
  placeholder: string;
  // Rendered above the option list in the empty-query state (e.g. "Recent").
  recentsLabel?: string;
  // When the query is empty and any of these ids are present in the searcher
  // result, the empty-query list is narrowed and ordered to just these.
  recentIds?: string[];
  // Rendered above the option list once the user has typed.
  resultsLabel?: string;
  // Extra element in the no-match state (e.g. the "Create product" affordance).
  noMatch?: (query: string) => React.ReactNode;
  // Per-row trailing content (e.g. stock on hand). Text goes through format.ts.
  renderTrailing?: (option: Option<T>) => React.ReactNode;
  // Debounce for the searcher, in ms.
  debounceMs?: number;
}

// Headless combobox body: a cmdk Command with client filtering OFF (shouldFilter
// false), a debounced searcher, and the four required states - empty/recents,
// no-match, loading, list. The pickers layer their own row content on top.
export function ComboboxCore<T>({
  onSelect,
  disabled,
  searcher,
  placeholder,
  recentsLabel,
  recentIds,
  resultsLabel,
  noMatch,
  renderTrailing,
  debounceMs = 150,
}: ComboboxCoreProps<T>) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const searcherRef = useRef(searcher);
  searcherRef.current = searcher;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      void searcherRef.current(query).then((next) => {
        if (cancelled) return;
        setOptions(next);
        setLoading(false);
      });
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, debounceMs]);

  const isEmptyQuery = query.trim() === "";
  // In the empty-query state, narrow+order to the caller's recents when any of
  // them are present in the searcher result.
  const recentSet =
    isEmptyQuery && recentIds && recentIds.length > 0
      ? recentIds.filter((id) => options.some((o) => o.id === id))
      : [];
  const visible =
    recentSet.length > 0
      ? recentSet
          .map((id) => options.find((o) => o.id === id))
          .filter((o): o is Option<T> => Boolean(o))
      : options;
  const heading =
    isEmptyQuery && recentSet.length > 0 ? recentsLabel : resultsLabel;

  return (
    <Command shouldFilter={false} label={placeholder}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={placeholder}
      />
      <CommandList>
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {m.combobox_loading()}
          </div>
        ) : options.length === 0 ? (
          noMatch && !isEmptyQuery ? (
            <div className="p-1">{noMatch(query.trim())}</div>
          ) : (
            <CommandEmpty>
              <span className="text-muted-foreground">
                {m.combobox_no_match()}
              </span>
            </CommandEmpty>
          )
        ) : (
          <CommandGroup heading={heading}>
            {visible.map((option) => (
              <CommandItem
                key={option.id}
                value={option.id}
                onSelect={() => onSelect(option.value)}
                className="gap-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{option.label}</span>
                  {(option.code || option.unit) && (
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {option.code && (
                        <span className="font-mono">{option.code}</span>
                      )}
                      {option.unit && <span>{option.unit}</span>}
                    </span>
                  )}
                </div>
                {renderTrailing && (
                  <span
                    className={cn(
                      "ml-auto text-right font-mono text-sm tabular-nums",
                    )}
                  >
                    {renderTrailing(option)}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
