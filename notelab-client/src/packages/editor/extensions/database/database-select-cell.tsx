import { Check, GripVertical } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { useUpdateDatabaseProperty } from "@/features/databases/hooks"
import { useIsMobile } from "@/hooks/use-mobile"
import { colorTokens } from "@/packages/editor/components/editor/toolbar-data"

type DatabaseSelectOption = {
  color?: string
  id: string
  name: string
}

type DatabasePropertyConfig = {
  options?: DatabaseSelectOption[]
}

function getSelectColorToken(color?: string | null) {
  if (!color || color === "default") {
    return colorTokens[0]
  }

  return (
    colorTokens.find(
      (token) =>
        token.value === color || token.name.toLowerCase() === color.toLowerCase()
    ) ?? colorTokens[0]
  )
}

function getSelectBadgeClassName(color?: string | null) {
  const token = getSelectColorToken(color)

  return `database-select-badge ${token.backgroundClass}`
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

const cyclingColorTokens = colorTokens.filter((token) => token.value)

function getNextOptionColor(options: DatabaseSelectOption[]) {
  return cyclingColorTokens[options.length % cyclingColorTokens.length]?.value ?? "default"
}

export function DatabaseSelectCell({
  databaseId,
  propertyConfig,
  defaultOptions = [],
  propertyId,
  propertyName,
  value,
  multiple = false,
  onSelect,
}: {
  databaseId: string
  defaultOptions?: DatabaseSelectOption[]
  multiple?: boolean
  propertyConfig?: unknown
  propertyId: string
  propertyName: string
  value: string | string[]
  onSelect: (value: string | string[]) => void
}) {
  const isMobile = useIsMobile()
  const updateProperty = useUpdateDatabaseProperty()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState<{
    left: number
    top: number
  } | null>(null)
  const [query, setQuery] = useState("")
  const configuredOptions = getSelectOptions(propertyConfig)
  const selectOptions =
    configuredOptions.length > 0 ? configuredOptions : defaultOptions
  const selectedValues = Array.isArray(value) ? value : value ? [value] : []
  const getOptionColor = (optionName: string) =>
    selectOptions.find((option) => option.name === optionName)?.color
  const normalizedQuery = query.trim().toLowerCase()
  const filteredSelectOptions = normalizedQuery
    ? selectOptions.filter((option) =>
        option.name.toLowerCase().includes(normalizedQuery)
      )
    : selectOptions
  const matchingSelectOption = selectOptions.find(
    (option) => option.name.toLowerCase() === normalizedQuery
  )
  const canCreateSelectOption =
    query.trim().length > 0 && !matchingSelectOption

  useEffect(() => {
    if (!isOpen || isMobile) {
      return
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target

      if (!(target instanceof globalThis.Node)) {
        return
      }

      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return
      }

      closePanel()
    }

    document.addEventListener("pointerdown", handlePointerDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [isMobile, isOpen])

  const openPanel = () => {
    const rect = triggerRef.current?.getBoundingClientRect()

    if (!rect) {
      return
    }

    setPanelPosition({
      left: rect.left,
      top: rect.top,
    })
    setIsOpen(true)
  }

  const closePanel = () => {
    setIsOpen(false)
    setPanelPosition(null)
    setQuery("")
  }

  const selectOption = (optionName: string) => {
    if (!multiple) {
      onSelect(optionName)
      closePanel()
      return
    }

    const nextValues = selectedValues.includes(optionName)
      ? selectedValues.filter((selectedValue) => selectedValue !== optionName)
      : [...selectedValues, optionName]

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
          if (multiple) {
            onSelect([...selectedValues, optionName])
            setQuery("")
            return
          }

          selectOption(optionName)
        },
      }
    )
  }

  const trigger = (
    <button
      aria-label={`${propertyName} value`}
      className="database-select-cell-trigger"
      onClick={isMobile ? undefined : openPanel}
      ref={triggerRef}
      type="button"
    >
      {selectedValues.map((selectedValue) => (
        <span
          className={getSelectBadgeClassName(getOptionColor(selectedValue))}
          key={selectedValue}
        >
          {selectedValue}
        </span>
      ))}
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
              selectOption(filteredSelectOptions[0].name)
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
        {multiple
          ? "Select options or create one"
          : "Select an option or create one"}
      </div>
      <div className="database-select-options">
        {filteredSelectOptions.map((option) => {
          const isSelected = selectedValues.includes(option.name)

          return (
            <button
              className="database-select-option"
              data-selected={isSelected ? "true" : undefined}
              key={option.id}
              onClick={() => selectOption(option.name)}
              type="button"
            >
              <GripVertical />
              <span
                className={getSelectBadgeClassName(option.color)}
              >
                {option.name}
              </span>
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
            <span className={getSelectBadgeClassName(getNextOptionColor(selectOptions))}>
              {query.trim()}
            </span>
          </button>
        ) : null}
      </div>
    </>
  )

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => (open ? setIsOpen(true) : closePanel())}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[85vh] bg-popover px-1 pb-2 text-popover-foreground">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{propertyName}</DrawerTitle>
          </DrawerHeader>
          <div className="database-select-drawer">{panel}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <>
      {trigger}
      {isOpen && panelPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="database-select-popover"
              ref={panelRef}
              style={panelPosition}
            >
              {panel}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
