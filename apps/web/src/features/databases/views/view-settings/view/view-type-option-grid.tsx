import { cn } from "@/shared/lib/utils";

import {
  databaseViewTypeOptions,
  type DatabaseViewType,
} from "../model/view-type-options";

type ViewTypeOptionGridProps = {
  className?: string;
  isOptionDisabled?: (type: DatabaseViewType) => boolean;
  onSelect: (type: DatabaseViewType) => void;
  selectedType?: string | null;
};

export function ViewTypeOptionGrid({
  className,
  isOptionDisabled,
  onSelect,
  selectedType,
}: ViewTypeOptionGridProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-1.5 p-1", className)}>
      {databaseViewTypeOptions.map((option) => {
        const selected = selectedType === option.type;

        return (
          <button
            aria-pressed={selectedType == null ? undefined : selected}
            className={cn(
              "flex h-20 flex-col items-center justify-center gap-1.5 rounded-md border text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              selected && "border-primary bg-primary-subtle text-primary",
            )}
            disabled={isOptionDisabled?.(option.type)}
            key={option.type}
            onClick={(event) => {
              event.preventDefault();
              onSelect(option.type);
            }}
            type="button"
          >
            <option.icon className="size-5" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
