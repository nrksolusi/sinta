import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectFieldOption {
  value: string;
  label: string;
}

// Single-value select for the labeled dropdowns across the app. Base UI's
// Select.Value resolves the trigger label from the root's `items` map (not the
// selected item's DOM text, unlike Radix), so this wraps the shadcn pieces and
// derives `items` from the same options that render the list - callers can't
// forget it and see the raw value.
export function SelectField({
  options,
  value,
  onValueChange,
  placeholder,
  id,
  size,
  className,
  "aria-labelledby": ariaLabelledby,
}: {
  options: SelectFieldOption[];
  value: string | undefined;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <Select items={options} value={value} onValueChange={onValueChange}>
      <SelectTrigger
        id={id}
        size={size}
        className={className}
        aria-labelledby={ariaLabelledby}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
