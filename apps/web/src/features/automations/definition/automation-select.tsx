import { cn } from "@/shared/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

const emptySelectValue = "__automation_select_empty__";

export function AutomationSelect({
  ariaLabel,
  className,
  disabled,
  onValueChange,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(nextValue) => onValueChange(nextValue === emptySelectValue ? "" : nextValue)}
      value={value || emptySelectValue}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("w-full min-w-0", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" position="popper">
        {options.map((option) => (
          <SelectItem
            key={option.value || emptySelectValue}
            value={option.value || emptySelectValue}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

