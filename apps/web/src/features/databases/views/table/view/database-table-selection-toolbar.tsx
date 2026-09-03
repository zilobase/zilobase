import {
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react"
import { Check, Link2, List, Minus, MoreHorizontal, X } from "@/shared/components/icons"
import { cn } from "@/shared/lib/utils"
import { Input } from "@/shared/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer"
import { DatabasePropertyDate } from "../../../properties/editors/database-property-date"
import { DatabasePropertySelect } from "../../../properties/editors/database-property-select"
import {
  defaultStatusOption,
  defaultStatusOptions,
  getDatabasePropertyCellKind,
  getDatabasePropertyType,
} from "../../../core/database-property-types"
import type { DatabasePropertyValue as DatabasePropertyValueType } from "../../../core/database-property-values"
import { getPersonLimit } from "../../model/database-view-config"
import type { DatabasePropertyListItem } from "../../kanban/model/database-kanban-config"
import { splitDatabaseSelectionProperties } from "../model/database-table-selection"

function DatabaseSelectionPropertyTrigger({
  className,
  disabled = false,
  property,
  ...buttonProps
}: {
  property: DatabasePropertyListItem
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "property">) {
  const PropertyIcon = getDatabasePropertyType(property.property.type).icon

  return (
    <button
      aria-label={`Edit ${property.property.name} for selected rows`}
      className={cn("database-selection-property-action", className)}
      disabled={disabled}
      title={disabled ? "This property can't be edited in bulk" : undefined}
      type="button"
      {...buttonProps}
    >
      <PropertyIcon />
      <span>{property.property.name}</span>
    </button>
  )
}

function DatabaseSelectionPropertyAction({
  mixed,
  onApply,
  onOpenChange,
  onUpdateConfig,
  open,
  personOptions,
  property,
  trigger: customTrigger,
  value,
}: {
  mixed: boolean
  onApply: (value: DatabasePropertyValueType) => void
  onOpenChange?: (open: boolean) => void
  onUpdateConfig: (databasePropertyId: string, config: unknown) => Promise<unknown>
  open?: boolean
  personOptions: Array<{ id: string; name: string; suffix?: string }>
  property: DatabasePropertyListItem
  trigger?: ReactNode
  value: DatabasePropertyValueType
}) {
  const [inputOpen, setInputOpen] = useState(false)
  const [draftValue, setDraftValue] = useState("")
  const pageProperty = property.property
  const cellKind = getDatabasePropertyCellKind(pageProperty.type)
  const scalarValue = Array.isArray(value) ? value[0] ?? "" : value
  const resolvedInputOpen = open ?? inputOpen
  const trigger =
    customTrigger ?? <DatabaseSelectionPropertyTrigger property={property} />

  if (cellKind === "select" || cellKind === "person") {
    const multiple =
      pageProperty.type === "multi_select" ||
      (cellKind === "person" &&
        getPersonLimit(pageProperty.config) !== "one_person")
    const selectionValue =
      pageProperty.type === "status" && !mixed && !value
        ? defaultStatusOption.name
        : value

    return (
      <DatabasePropertySelect
        allowCreate={cellKind !== "person"}
        defaultOptions={
          pageProperty.type === "status"
            ? defaultStatusOptions
            : cellKind === "person"
              ? personOptions
              : undefined
        }
        label={pageProperty.name}
        multiple={multiple}
        open={open}
        onOpenChange={onOpenChange}
        onPropertyConfigChange={(config) =>
          onUpdateConfig(property.id, config)
        }
        onSelect={onApply}
        propertyConfig={pageProperty.config}
        showStatusDot={pageProperty.type === "status"}
        trigger={trigger}
        value={selectionValue}
        valueKey={cellKind === "person" ? "id" : "name"}
      />
    )
  }

  if (cellKind === "date") {
    return (
      <DatabasePropertyDate
        label={pageProperty.name}
        open={open}
        onOpenChange={onOpenChange}
        onPropertyConfigChange={(config) =>
          onUpdateConfig(property.id, config)
        }
        onSelect={onApply}
        propertyConfig={pageProperty.config}
        trigger={trigger}
        value={value}
      />
    )
  }

  if (cellKind === "checkbox") {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1" sideOffset={4}>
          {[
            { icon: Check, label: "Checked", value: "true" },
            { icon: Minus, label: "Unchecked", value: "false" },
          ].map((option) => {
            const OptionIcon = option.icon
            const isCurrent = !mixed && scalarValue === option.value

            return (
              <button
                className="database-selection-value-option"
                key={option.value}
                onClick={() => onApply(option.value)}
                type="button"
              >
                <OptionIcon />
                <span>{option.label}</span>
                {isCurrent ? <Check className="ml-auto" /> : null}
              </button>
            )
          })}
        </PopoverContent>
      </Popover>
    )
  }

  if (cellKind !== "input") {
    return customTrigger ?? (
      <DatabaseSelectionPropertyTrigger disabled property={property} />
    )
  }

  return (
    <Popover
      open={resolvedInputOpen}
      onOpenChange={(nextOpen) => {
        if (open === undefined) setInputOpen(nextOpen)
        onOpenChange?.(nextOpen)

        if (nextOpen) {
          setDraftValue(mixed ? "" : scalarValue)
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2" sideOffset={4}>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            onApply(draftValue)
            if (open === undefined) setInputOpen(false)
            onOpenChange?.(false)
          }}
        >
          <Input
            aria-label={`${pageProperty.name} value for selected rows`}
            autoFocus
            onChange={(event) => setDraftValue(event.target.value)}
            placeholder={mixed ? "Replace mixed values" : "Enter a value"}
            type={pageProperty.type === "number" ? "number" : "text"}
            value={draftValue}
          />
          <button className="database-selection-apply" type="submit">
            Apply
          </button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

export function DatabaseTableSelectionToolbar({
  clearSelection,
  copyLinks,
  getSelectionValue,
  onApply,
  onUpdateConfig,
  personOptions,
  properties,
  selectedCount,
}: {
  clearSelection: () => void
  copyLinks: () => void
  getSelectionValue: (property: DatabasePropertyListItem) => {
    mixed: boolean
    value: DatabasePropertyValueType
  }
  onApply: (
    property: DatabasePropertyListItem,
    value: DatabasePropertyValueType
  ) => void
  onUpdateConfig: (databasePropertyId: string, config: unknown) => Promise<unknown>
  personOptions: Array<{ id: string; name: string; suffix?: string }>
  properties: DatabasePropertyListItem[]
  selectedCount: number
}) {
  const [menuPropertyId, setMenuPropertyId] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreSearch, setMoreSearch] = useState("")
  const ignoreMenuPropertyCloseUntilRef = useRef(0)
  const { primary } = splitDatabaseSelectionProperties(properties)
  const normalizedSearch = moreSearch.trim().toLowerCase()
  const filteredProperties = normalizedSearch
    ? properties.filter((property) =>
        property.property.name.toLowerCase().includes(normalizedSearch)
      )
    : properties
  const showEditProperty =
    filteredProperties.length > 0 &&
    (!normalizedSearch ||
      "edit property".includes(normalizedSearch) ||
      filteredProperties.length > 0)
  const showCopyLinks =
    !normalizedSearch || "copy links to all".includes(normalizedSearch)
  const showClearSelection =
    !normalizedSearch || "clear selection".includes(normalizedSearch)
  const menuProperty = menuPropertyId
    ? properties.find((property) => property.id === menuPropertyId) ?? null
    : null
  const menuSelectionValue = menuProperty
    ? getSelectionValue(menuProperty)
    : null
  const renderAction = (property: DatabasePropertyListItem) => {
    const selectionValue = getSelectionValue(property)

    return (
      <DatabaseSelectionPropertyAction
        key={property.id}
        mixed={selectionValue.mixed}
        onApply={(value) => onApply(property, value)}
        onUpdateConfig={onUpdateConfig}
        personOptions={personOptions}
        property={property}
        value={selectionValue.value}
      />
    )
  }
  const renderMenuAction = (property: DatabasePropertyListItem) => {
    const PropertyIcon = getDatabasePropertyType(property.property.type).icon
    const cellKind = getDatabasePropertyCellKind(property.property.type)
    const canEdit = ![
      "button",
      "files",
      "formula",
      "read_only_time",
      "relation",
      "rollup",
    ].includes(cellKind)

    return (
      <DropDrawerItem
        disabled={!canEdit}
        key={`menu:${property.id}`}
        onSelect={() => {
          setMoreOpen(false)
          window.setTimeout(() => {
            ignoreMenuPropertyCloseUntilRef.current = performance.now() + 250
            setMenuPropertyId(property.id)
          }, 100)
        }}
      >
        <PropertyIcon />
        <span className="truncate">{property.property.name}</span>
      </DropDrawerItem>
    )
  }

  return (
    <div
      aria-label="Selected row actions"
      className="database-selection-toolbar"
      role="toolbar"
    >
      <button
        aria-label={`Clear selection of ${selectedCount} rows`}
        className="database-selection-count"
        onClick={clearSelection}
        type="button"
      >
        {selectedCount} selected
      </button>
      <div className="database-selection-property-group">
        {primary.map(renderAction)}
        <DropDrawer
          open={moreOpen}
          onOpenChange={(open) => {
            setMoreOpen(open)
            if (!open) setMoreSearch("")
          }}
        >
          <DropDrawerTrigger asChild>
            <button
              aria-label="More selected row actions"
              className="database-selection-more"
              type="button"
            >
              <MoreHorizontal />
            </button>
          </DropDrawerTrigger>
          <DropDrawerContent align="start" className="w-72">
            <div className="p-1">
              <Input
                aria-label="Search selected row actions"
                autoFocus
                className="h-8"
                onChange={(event) => setMoreSearch(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="Search actions..."
                value={moreSearch}
              />
            </div>
            <DropDrawerLabel>Page</DropDrawerLabel>
            {showEditProperty ? (
              <DropDrawerSub>
                <DropDrawerSubTrigger>
                  <List />
                  <span>Edit property</span>
                </DropDrawerSubTrigger>
                <DropDrawerSubContent className="w-64">
                  {filteredProperties.map(renderMenuAction)}
                </DropDrawerSubContent>
              </DropDrawerSub>
            ) : null}
            {showCopyLinks ? (
              <DropDrawerItem onSelect={copyLinks}>
                <Link2 />
                <span>Copy links to all</span>
              </DropDrawerItem>
            ) : null}
            {showClearSelection ? (
              <>
                <DropDrawerSeparator />
                <DropDrawerItem onSelect={clearSelection}>
                  <X />
                  <span>Clear selection</span>
                </DropDrawerItem>
              </>
            ) : null}
            {!showEditProperty && !showCopyLinks && !showClearSelection ? (
              <div className="px-2 py-2 text-sm text-content-secondary">
                No actions found.
              </div>
            ) : null}
          </DropDrawerContent>
        </DropDrawer>
        {menuProperty && menuSelectionValue ? (
          <DatabaseSelectionPropertyAction
            mixed={menuSelectionValue.mixed}
            onApply={(value) => onApply(menuProperty, value)}
            onOpenChange={(open) => {
              if (
                !open &&
                performance.now() >= ignoreMenuPropertyCloseUntilRef.current
              ) {
                setMenuPropertyId(null)
              }
            }}
            onUpdateConfig={onUpdateConfig}
            open
            personOptions={personOptions}
            property={menuProperty}
            trigger={
              <button
                aria-hidden="true"
                className="database-selection-menu-anchor"
                tabIndex={-1}
                type="button"
              />
            }
            value={menuSelectionValue.value}
          />
        ) : null}
      </div>
    </div>
  )
}

