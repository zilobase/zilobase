import { Check, GripVertical } from "lucide-react"
import { useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useUpdateDatabaseProperty } from "@/features/databases/hooks"
import {
  cyclingColorTokens,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
} from "@/packages/editor/components/editor/toolbar-data"

type DatabaseSelectOption = {
  color?: string
  id: string
  name: string
  suffix?: string
}

type DatabasePropertyConfig = {
  options?: DatabaseSelectOption[]
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
    (option): option is DatabaseSelectOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof option.id === "string" &&
      typeof option.name === "string"
  )
}

function getSelectConfigWithOptions(
  config: unknown,
  options: DatabaseSelectOption[]
) {
  return {
    ...(config && typeof config === "object" ? config : {}),
    options,
  }
}

function getNextOptionColor(options: DatabaseSelectOption[]) {
  return cyclingColorTokens[options.length % cyclingColorTokens.length]?.value ?? "default"
}

export function DatabaseSelectCell({
  allowCreate = true,
  databaseId,
  editable = true,
  propertyConfig,
  defaultOptions = [],
  propertyId,
  propertyName,
  value,
  multiple = false,
  onSelect,
  showStatusDot = false,
  valueKey = "name",
}: {
  allowCreate?: boolean
  databaseId: string
  defaultOptions?: DatabaseSelectOption[]
  editable?: boolean
  multiple?: boolean
  propertyConfig?: unknown
  propertyId: string
  propertyName: string
  value: string | string[]
  onSelect: (value: string | string[]) => void
  showStatusDot?: boolean
  valueKey?: "id" | "name"
}) {
  const updateProperty = useUpdateDatabaseProperty()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const configuredOptions = getSelectOptions(propertyConfig)
  const selectOptions =
    configuredOptions.length > 0 ? configuredOptions : defaultOptions
  const selectedValues = Array.isArray(value) ? value : value ? [value] : []
  const getOptionValue = (option: DatabaseSelectOption) => option[valueKey]
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
    allowCreate && query.trim().length > 0 && !matchingSelectOption

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
  }

  const setOpen = (open: boolean) => {
    if (open) {
      setIsOpen(true)
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

  const createSelectOption = () => {
    const optionName = query.trim()

    if (!optionName) {
      return
    }

    const nextOptions = [
      ...selectOptions,
      {
        color: getNextOptionColor(selectOptions),
        id: crypto.randomUUID(),
        name: optionName,
      },
    ]

    updateProperty.mutate(
      {
        config: getSelectConfigWithOptions(propertyConfig, nextOptions),
        databaseId,
        databasePropertyId: propertyId,
      },
      {
        onSuccess: () => {
          const createdOption = nextOptions[nextOptions.length - 1]
          const optionValue = valueKey === "id" ? createdOption?.id : optionName

          if (multiple) {
            onSelect(
              optionValue ? [...selectedValues, optionValue] : selectedValues
            )
            setQuery("")
            return
          }

          if (optionValue) {
            selectOption(optionValue)
          }
        },
      }
    )
  }

  const trigger = (
    <button
      aria-label={`${propertyName} value`}
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
              createSelectOption()
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
            onClick={createSelectOption}
            type="button"
          >
            <span>Create</span>
            <span className={getColorTokenBadgeClassName(getNextOptionColor(selectOptions))}>
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
