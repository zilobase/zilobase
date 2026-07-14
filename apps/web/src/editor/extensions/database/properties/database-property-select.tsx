import { Check, GripVertical } from "lucide-react"
import { useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/lib/color-tokens"
import { getNextDatabaseOptionColor } from "../core/database-property-types"
import type { DatabaseSelectOption } from "../views/database-view-config"
import { toStringArray } from "../core/utils"

type DatabasePropertySelectOption = DatabaseSelectOption & {
  suffix?: string
}

type DatabasePropertyConfig = {
  options?: DatabasePropertySelectOption[]
}

function DatabaseSelectBadge({
  children,
  color,
  showDot = false,
  suffix,
}: {
  children: string
  color?: string
  showDot?: boolean
  suffix?: string
}) {
  return (
    <span className={getColorTokenBadgeClassName(color)}>
      {showDot ? (
        <span
          aria-hidden="true"
          className={getColorTokenDotClassName(color)}
        />
      ) : null}
      {children}
      {suffix ? <span className="ml-1 opacity-70">{suffix}</span> : null}
    </span>
  )
}

function getSelectOptions(config: unknown) {
  if (!config || typeof config !== "object" || !("options" in config)) {
    return []
  }

  const options = (config as DatabasePropertyConfig).options

  if (!Array.isArray(options)) {
    return []
  }

  return options.filter(
    (option): option is DatabasePropertySelectOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof option.id === "string" &&
      typeof option.name === "string"
  )
}

function getSelectConfigWithOptions(
  config: unknown,
  options: DatabasePropertySelectOption[]
) {
  return {
    ...(config && typeof config === "object" ? config : {}),
    options,
  }
}

export function DatabasePropertySelect({
  allowCreate = true,
  editable = true,
  propertyConfig,
  defaultOptions = [],
  label,
  value,
  multiple = false,
  onOpenChange,
  onSelect,
  onPropertyConfigChange,
  showStatusDot = false,
  valueKey = "name",
}: {
  allowCreate?: boolean
  defaultOptions?: DatabasePropertySelectOption[]
  editable?: boolean
  label: string
  multiple?: boolean
  onOpenChange?: (open: boolean) => void
  onPropertyConfigChange?: (
    config: unknown,
    createdOption: DatabaseSelectOption
  ) => Promise<unknown> | unknown
  propertyConfig?: unknown
  value: string | string[]
  onSelect: (value: string | string[]) => void
  showStatusDot?: boolean
  valueKey?: "id" | "name"
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [query, setQuery] = useState("")
  const configuredOptions = getSelectOptions(propertyConfig)
  const selectOptions =
    configuredOptions.length > 0 ? configuredOptions : defaultOptions
  const selectedValues = toStringArray(value)
  const getOptionValue = (option: DatabasePropertySelectOption) => option[valueKey]
  const getSelectedOption = (optionValue: string) =>
    selectOptions.find((option) => getOptionValue(option) === optionValue)
  const getOptionColor = (optionValue: string) =>
    getSelectedOption(optionValue)?.color
  const normalizedQuery = query.trim().toLowerCase()
  const filteredSelectOptions = normalizedQuery
    ? selectOptions.filter((option) =>
        `${option.name} ${option.suffix ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : selectOptions
  const matchingSelectOption = selectOptions.find(
    (option) => option.name.toLowerCase() === normalizedQuery
  )
  const canCreateSelectOption =
    allowCreate &&
    Boolean(onPropertyConfigChange) &&
    query.trim().length > 0 &&
    !matchingSelectOption

  if (!editable) {
    return (
      <span className="database-select-cell-trigger">
        {selectedValues.map((selectedValue) => {
          const selectedOption = getSelectedOption(selectedValue)

          return (
            <DatabaseSelectBadge
              color={getOptionColor(selectedValue)}
              key={selectedValue}
              showDot={showStatusDot}
              suffix={selectedOption?.suffix}
            >
              {selectedOption?.name ?? selectedValue}
            </DatabaseSelectBadge>
          )
        })}
      </span>
    )
  }

  const closePanel = () => {
    setIsOpen(false)
    setQuery("")
    onOpenChange?.(false)
  }

  const setOpen = (open: boolean) => {
    if (open) {
      setIsOpen(true)
      onOpenChange?.(true)
      return
    }

    closePanel()
  }

  const selectOption = (optionValue: string) => {
    if (!multiple) {
      onSelect(optionValue)
      closePanel()
      return
    }

    const nextValues = selectedValues.includes(optionValue)
      ? selectedValues.filter((selectedValue) => selectedValue !== optionValue)
      : [...selectedValues, optionValue]

    onSelect(nextValues)
  }

  const createSelectOption = async () => {
    const optionName = query.trim()

    if (!optionName || !onPropertyConfigChange) {
      return
    }

    const nextOptions = [
      ...selectOptions,
      {
        color: getNextDatabaseOptionColor(selectOptions.length),
        id: crypto.randomUUID(),
        name: optionName,
      },
    ]
    const createdOption = nextOptions[nextOptions.length - 1]
    const optionValue = valueKey === "id" ? createdOption?.id : optionName

    setIsCreating(true)

    try {
      await onPropertyConfigChange(
        getSelectConfigWithOptions(propertyConfig, nextOptions),
        createdOption
      )

      if (multiple) {
        onSelect(optionValue ? [...selectedValues, optionValue] : selectedValues)
        setQuery("")
        return
      }

      if (optionValue) {
        selectOption(optionValue)
      }
    } finally {
      setIsCreating(false)
    }
  }

  const trigger = (
    <button
      aria-label={`${label} value`}
      className="database-select-cell-trigger"
      type="button"
    >
      {selectedValues.map((selectedValue) => {
        const selectedOption = getSelectedOption(selectedValue)

        return (
          <DatabaseSelectBadge
            color={getOptionColor(selectedValue)}
            key={selectedValue}
            showDot={showStatusDot}
            suffix={selectedOption?.suffix}
          >
            {selectedOption?.name ?? selectedValue}
          </DatabaseSelectBadge>
        )
      })}
    </button>
  )
  const panel = (
    <>
      <input
        autoFocus
        className="database-select-search"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()

            if (canCreateSelectOption) {
              void createSelectOption()
            } else if (filteredSelectOptions[0]) {
              selectOption(getOptionValue(filteredSelectOptions[0]))
            }
          }

          if (event.key === "Escape") {
            closePanel()
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
          const optionValue = getOptionValue(option)
          const isSelected = selectedValues.includes(optionValue)

          return (
            <button
              className="database-select-option"
              data-selected={isSelected ? "true" : undefined}
              key={option.id}
              onClick={() => selectOption(optionValue)}
              type="button"
            >
              <GripVertical />
              <DatabaseSelectBadge
                color={option.color}
                showDot={showStatusDot}
                suffix={option.suffix}
              >
                {option.name}
              </DatabaseSelectBadge>
              {isSelected ? (
                <Check className="database-select-option-check" />
              ) : null}
            </button>
          )
        })}
        {canCreateSelectOption ? (
          <button
            className="database-select-create"
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
  )

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-1 p-1" sideOffset={0}>
        {panel}
      </PopoverContent>
    </Popover>
  )
}

export { DatabasePropertySelect as DatabaseSelectCell }
