import { Check, GripVertical } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
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

const SELECT_POPOVER_WIDTH = 288
const SELECT_POPOVER_HEIGHT = 320
const SELECT_POPOVER_OFFSET = 6
const SELECT_POPOVER_PADDING = 16

function getSelectPopoverPosition(
  rect: DOMRect,
  panelHeight = SELECT_POPOVER_HEIGHT
) {
  const spaceBelow =
    window.innerHeight - rect.bottom - SELECT_POPOVER_PADDING
  const spaceAbove = rect.top - SELECT_POPOVER_PADDING
  const shouldOpenAbove =
    spaceBelow < SELECT_POPOVER_HEIGHT + SELECT_POPOVER_OFFSET &&
    spaceAbove > spaceBelow
  const maxLeft = Math.max(
    SELECT_POPOVER_PADDING,
    window.innerWidth - SELECT_POPOVER_WIDTH - SELECT_POPOVER_PADDING
  )
  const left = Math.min(Math.max(rect.left, SELECT_POPOVER_PADDING), maxLeft)
  const preferredTop = shouldOpenAbove
    ? rect.top - panelHeight - SELECT_POPOVER_OFFSET
    : rect.bottom + SELECT_POPOVER_OFFSET
  const maxTop = Math.max(
    SELECT_POPOVER_PADDING,
    window.innerHeight - panelHeight - SELECT_POPOVER_PADDING
  )
  const top = Math.min(Math.max(preferredTop, SELECT_POPOVER_PADDING), maxTop)

  return {
    left,
    top,
  }
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

  const updatePanelPosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect()

    if (!rect) {
      return
    }

    setPanelPosition(
      getSelectPopoverPosition(
        rect,
        panelRef.current?.getBoundingClientRect().height
      )
    )
  }

  useLayoutEffect(() => {
    if (!isOpen || isMobile || !panelRef.current) {
      return
    }

    updatePanelPosition()
  }, [isMobile, isOpen, filteredSelectOptions.length, canCreateSelectOption])

  useEffect(() => {
    if (!isOpen || isMobile) {
      return
    }

    const handlePositionUpdate = () => updatePanelPosition()

    window.addEventListener("resize", handlePositionUpdate)
    window.addEventListener("scroll", handlePositionUpdate, true)

    return () => {
      window.removeEventListener("resize", handlePositionUpdate)
      window.removeEventListener("scroll", handlePositionUpdate, true)
    }
  }, [isMobile, isOpen])

  const openPanel = () => {
    updatePanelPosition()
    setIsOpen(true)
  }

  const closePanel = () => {
    setIsOpen(false)
    setPanelPosition(null)
    setQuery("")
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
      onClick={isMobile ? undefined : openPanel}
      ref={triggerRef}
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
