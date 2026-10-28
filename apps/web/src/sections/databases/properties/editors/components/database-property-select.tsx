import { getSelectOptions, getSelectConfigWithOptions } from "@zilobase/features/databases";
import { cn } from "@/lib/utils";
import { menuItemVariants } from "@/components/ui/menu-styles";
import { Check, GripVertical } from "@/components/icons";
import { useState, type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getColorTokenBadgeClassName, getColorTokenDotClassName } from "@/lib/color-tokens";
import { getNextDatabaseOptionColor } from "../../lib/property-catalog";
import type { DatabaseSelectOption } from "@zilobase/features/databases";
import { toStringArray } from "@zilobase/features/databases";

type DatabasePropertySelectOption = DatabaseSelectOption & {
  suffix?: string;
};

function DatabaseSelectBadge({
  children,
  color,
  showDot = false,
  suffix,
}: {
  children: string;
  color?: string;
  showDot?: boolean;
  suffix?: string;
}) {
  return (
    <span className={getColorTokenBadgeClassName(color)}>
      {showDot ? <span aria-hidden="true" className={getColorTokenDotClassName(color)} /> : null}
      {children}
      {suffix ? <span className="ml-1 opacity-70">{suffix}</span> : null}
    </span>
  );
}

export function DatabasePropertySelect({
  allowCreate = true,
  inline = false,
  editable = true,
  emptyLabel,
  propertyConfig,
  defaultOptions = [],
  label,
  value,
  multiple = false,
  open: controlledOpen,
  onOpenChange,
  onSelect,
  onPropertyConfigChange,
  showStatusDot = false,
  trigger: customTrigger,
  valueKey = "name",
}: {
  allowCreate?: boolean;
  inline?: boolean;
  defaultOptions?: DatabasePropertySelectOption[];
  editable?: boolean;
  emptyLabel?: string;
  label: string;
  multiple?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPropertyConfigChange?: (
    config: unknown,
    createdOption: DatabaseSelectOption,
  ) => Promise<unknown> | unknown;
  propertyConfig?: unknown;
  value: string | string[];
  onSelect: (value: string | string[]) => void;
  showStatusDot?: boolean;
  trigger?: ReactNode;
  valueKey?: "id" | "name";
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [query, setQuery] = useState("");
  const configuredOptions = getSelectOptions(propertyConfig) as DatabasePropertySelectOption[];
  const selectOptions = configuredOptions.length > 0 ? configuredOptions : defaultOptions;
  const selectedValues = toStringArray(value);
  const getOptionValue = (option: DatabasePropertySelectOption) => option[valueKey];
  const getSelectedOption = (optionValue: string) =>
    selectOptions.find((option) => getOptionValue(option) === optionValue);
  const getOptionColor = (optionValue: string) => getSelectedOption(optionValue)?.color;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSelectOptions = normalizedQuery
    ? selectOptions.filter((option) =>
        `${option.name} ${option.suffix ?? ""}`.toLowerCase().includes(normalizedQuery),
      )
    : selectOptions;
  const matchingSelectOption = selectOptions.find(
    (option) => option.name.toLowerCase() === normalizedQuery,
  );
  const canCreateSelectOption =
    allowCreate &&
    Boolean(onPropertyConfigChange) &&
    query.trim().length > 0 &&
    !matchingSelectOption;
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const selectedContent =
    selectedValues.length > 0 ? (
      selectedValues.map((selectedValue) => {
        const selectedOption = getSelectedOption(selectedValue);

        return (
          <DatabaseSelectBadge
            color={getOptionColor(selectedValue)}
            key={selectedValue}
            showDot={showStatusDot}
            suffix={selectedOption?.suffix}
          >
            {selectedOption?.name ?? selectedValue}
          </DatabaseSelectBadge>
        );
      })
    ) : emptyLabel ? (
      <span className="text-content-secondary">{emptyLabel}</span>
    ) : null;

  if (!editable) {
    return <span className="database-select-cell-trigger">{selectedContent}</span>;
  }

  const closePanel = () => {
    if (controlledOpen === undefined) setUncontrolledOpen(false);
    setQuery("");
    onOpenChange?.(false);
  };

  const setOpen = (open: boolean) => {
    if (open) {
      if (controlledOpen === undefined) setUncontrolledOpen(true);
      onOpenChange?.(true);
      return;
    }

    closePanel();
  };

  const selectOption = (optionValue: string) => {
    if (!multiple) {
      onSelect(optionValue);
      closePanel();
      return;
    }

    const nextValues = selectedValues.includes(optionValue)
      ? selectedValues.filter((selectedValue) => selectedValue !== optionValue)
      : [...selectedValues, optionValue];

    onSelect(nextValues);
  };

  const createSelectOption = async () => {
    const optionName = query.trim();

    if (!optionName || !onPropertyConfigChange) {
      return;
    }

    const nextOptions = [
      ...selectOptions,
      {
        color: getNextDatabaseOptionColor(selectOptions.length),
        id: crypto.randomUUID(),
        name: optionName,
      },
    ];
    const createdOption = nextOptions[nextOptions.length - 1];
    const optionValue = valueKey === "id" ? createdOption?.id : optionName;

    setIsCreating(true);

    try {
      await onPropertyConfigChange(
        getSelectConfigWithOptions(propertyConfig, nextOptions),
        createdOption,
      );

      if (multiple) {
        onSelect(optionValue ? [...selectedValues, optionValue] : selectedValues);
        setQuery("");
        return;
      }

      if (optionValue) {
        selectOption(optionValue);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const trigger = (
    <button
      aria-label={`${label} value: ${selectedValues.map((selected) => getSelectedOption(selected)?.name ?? selected).join(", ") || emptyLabel || "Empty"}`}
      className="database-select-cell-trigger"
      type="button"
    >
      {selectedContent}
    </button>
  );
  const panel = (
    <>
      <input
        autoFocus
        className="database-select-search"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();

            if (canCreateSelectOption) {
              void createSelectOption();
            } else if (filteredSelectOptions[0]) {
              selectOption(getOptionValue(filteredSelectOptions[0]));
            }
          }

          if (event.key === "Escape") {
            closePanel();
          }
        }}
        placeholder="Search for an option..."
        value={query}
      />
      <div className="database-select-popover-label">
        {allowCreate
          ? multiple
            ? "Select options or create one"
            : "Select an option or create one"
          : multiple
            ? "Select options"
            : "Select an option"}
      </div>
      <div className="database-select-options">
        {filteredSelectOptions.map((option) => {
          const optionValue = getOptionValue(option);
          const isSelected = selectedValues.includes(optionValue);

          return (
            <button
              className={cn(menuItemVariants(), "w-full text-left hover:bg-action-neutral-hover")}
              data-selected={isSelected ? "true" : undefined}
              key={option.id}
              onClick={() => selectOption(optionValue)}
              type="button"
            >
              <GripVertical className="text-content-secondary" />
              <DatabaseSelectBadge
                color={option.color}
                showDot={showStatusDot}
                suffix={option.suffix}
              >
                {option.name}
              </DatabaseSelectBadge>
              {isSelected ? <Check className="ml-auto text-content-primary" /> : null}
            </button>
          );
        })}
        {canCreateSelectOption ? (
          <button
            className={cn(
              menuItemVariants(),
              "w-full text-left hover:bg-action-neutral-hover disabled:pointer-events-none disabled:opacity-50",
            )}
            disabled={isCreating}
            onClick={() => void createSelectOption()}
            type="button"
          >
            <span>{isCreating ? "Creating" : "Create"}</span>
            <span
              className={getColorTokenBadgeClassName(
                getNextDatabaseOptionColor(selectOptions.length),
              )}
            >
              {query.trim()}
            </span>
          </button>
        ) : null}
      </div>
    </>
  );

  if (inline) return <div data-database-property-editor="select">{panel}</div>;

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{customTrigger ?? trigger}</PopoverTrigger>
      <PopoverContent align="start" variant="menu">
        {panel}
      </PopoverContent>
    </Popover>
  );
}
