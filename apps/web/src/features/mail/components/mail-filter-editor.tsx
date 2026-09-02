import { useMemo, useState } from "react"
import {
  mailQuickFilterCatalog,
  mailSystemPropertyCatalog,
  maxMailFilterConditions,
  type MailAddress,
  type MailFilterCondition,
  type MailFilterExpression,
  type MailFilterNode,
  type MailFilterOperator,
  type MailFilterValue,
  type MailLabelRecord,
  type MailPropertyDefinition,
  type MailPropertyWorkspaceMember,
} from "@zilobase/features/mail"

import { DatabaseConditionEditor } from "@/features/databases/views/view/database-condition-editor"
import type { DatabaseSearchableMenuOption } from "@/features/databases/views/view/database-searchable-menu-items"
import { getDatabaseFilterOperatorLabel, getDatabaseFilterOperatorsForType, type DatabasePropertyFilterOperator } from "@/features/databases/views/model/database-view-config"
import { ChevronDown, CircleX, FilterIcon, MailIcon, Paperclip, Plus, SearchIcon, UserIcon, XIcon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { Input } from "@/shared/ui/input"
import { Switch } from "@/shared/ui/switch"
import { cn } from "@/shared/lib/utils"

type PropertyDefinition = {
  id: string
  label: string
  propertyType: string
  valueOptions: DatabaseSearchableMenuOption[]
}

type MailQuickFilter = (typeof mailQuickFilterCatalog)[number]

const toggleQuickFilterIds = new Set<string>(["has_attachments", "show_archived", "is_unread"])
const categoryQuickFilterIds = new Set<string>(["show_social", "show_promotions"])
const primaryMailQuickFilters = mailQuickFilterCatalog
  .filter((filter) => filter.id !== "no_attachments")
  .slice(0, 6)
const primaryDirectPropertyIds = new Set<string>(["from", "attachments", "date", "calendar_event"])
const hiddenMailFilterPropertyIds = new Set<string>(["mailbox", "email_domain"])

export function MailFilterToolbar({
  dirty,
  expression,
  labels,
  members = [],
  properties: customProperties = [],
  senders = [],
  onChange,
  onReset,
  onSave,
  onSaveAsNew,
  saving,
  hideImplicitInbox = false,
}: {
  dirty: boolean
  expression: MailFilterExpression
  labels: MailLabelRecord[]
  members?: MailPropertyWorkspaceMember[]
  properties?: MailPropertyDefinition[]
  senders?: MailAddress[]
  onChange: (filter: MailFilterExpression) => void
  onReset: () => void
  onSave: () => void
  onSaveAsNew: () => void
  saving: boolean
  hideImplicitInbox?: boolean
}) {
  const properties = useMailFilterProperties(labels, customProperties, members)
  const conditions = visibleConditions(expression, hideImplicitInbox)

  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Mail filters">
      {conditions.map((condition) => (
        <MailFilterPill
          condition={condition}
          dirty={dirty}
          key={condition.id}
          onChange={(patch) => onChange(updateCondition(expression, condition.id, patch, properties))}
          onRemove={() => onChange(removeNode(expression, condition.id))}
          onToggleEnabled={() => onChange(toggleConditionEnabled(expression, condition.id))}
          properties={properties}
          senders={senders}
        />
      ))}
      <MailQuickFilterPicker
        disabled={countConditions(expression) >= maxMailFilterConditions}
        expression={expression}
        onChange={onChange}
        properties={properties}
      />
      {dirty ? (
        <>
          <Button className="ml-auto" disabled={saving} onClick={onReset} size="sm" type="button" variant="ghost">Reset</Button>
          <div className="inline-flex overflow-hidden rounded-md border border-feedback-warning bg-feedback-warning-subtle">
            <Button className="rounded-none border-0 text-feedback-warning-text" disabled={saving} onClick={onSave} size="sm" type="button" variant="ghost">
              {saving ? "Saving…" : "Save filters"}
            </Button>
            <DropDrawer>
              <DropDrawerTrigger asChild>
                <Button aria-label="More save filter options" className="rounded-none border-0 border-l border-feedback-warning px-2 text-feedback-warning-text" disabled={saving} size="sm" type="button" variant="ghost">
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropDrawerTrigger>
              <DropDrawerContent align="end" className="w-52">
                <DropDrawerItem onSelect={onSaveAsNew}>Save as new view</DropDrawerItem>
              </DropDrawerContent>
            </DropDrawer>
          </div>
        </>
      ) : null}
    </div>
  )
}

function MailFilterPill({
  condition,
  dirty,
  onChange,
  onRemove,
  onToggleEnabled,
  properties,
  senders,
}: {
  condition: MailFilterCondition
  dirty: boolean
  onChange: (patch: { operator?: DatabasePropertyFilterOperator; propertyId?: string; values?: string[] }) => void
  onRemove: () => void
  onToggleEnabled: () => void
  properties: PropertyDefinition[]
  senders: MailAddress[]
}) {
  const [open, setOpen] = useState(false)

  const attachmentToggle = condition.propertyId === "attachments" && ["is_not_empty", "is_empty"].includes(condition.operator)
  const unreadToggle = condition.propertyId === "unread" && condition.operator === "is" && typeof condition.values[0] === "boolean"
  if (attachmentToggle || unreadToggle) {
    const label = conditionPillLabel(condition, properties)
    const enabled = condition.enabled !== false
    return (
      <Button
        aria-label={`${enabled ? "Deactivate" : "Activate"} ${label} filter`}
        aria-pressed={enabled}
        className={cn(
          "relative max-w-64 rounded-full px-3",
          enabled && "border-action-selected-border bg-action-selected-subtle text-action-selected-text hover:bg-action-selected-subtle",
        )}
        onClick={onToggleEnabled}
        size="lg"
        type="button"
        variant="secondary"
      >
        {attachmentToggle ? <Paperclip className="size-4" /> : <MailIcon className="size-4" />}
        <span className="truncate">{label}</span>
        {dirty ? <span aria-label="Unsaved filter" className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-feedback-warning" /> : null}
      </Button>
    )
  }

  return (
    <DropDrawer open={open} onOpenChange={setOpen}>
      <DropDrawerTrigger asChild>
        <Button
          className={cn(
            "relative max-w-64 rounded-full px-3",
            open && "border-action-selected-border bg-action-selected-subtle text-action-selected-text hover:bg-action-selected-subtle",
          )}
          size="lg"
          type="button"
          variant="secondary"
        >
          <FilterIcon className="size-4" />
          <span className="truncate">{conditionPillLabel(condition, properties)}</span>
          <ChevronDown className="size-3.5" />
          {dirty ? <span aria-label="Unsaved filter" className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-feedback-warning" /> : null}
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent align="start" className="w-80">
        <MailFocusedFilterEditor
          condition={condition}
          onBack={() => setOpen(false)}
          onChange={onChange}
          onRemove={() => {
            onRemove()
            setOpen(false)
          }}
          properties={properties}
          senders={senders}
        />
      </DropDrawerContent>
    </DropDrawer>
  )
}

export function MailFilterEditor({
  expression,
  labels,
  members = [],
  properties: customProperties = [],
  senders = [],
  onChange,
  hideImplicitInbox = false,
}: {
  expression: MailFilterExpression
  labels: MailLabelRecord[]
  members?: MailPropertyWorkspaceMember[]
  properties?: MailPropertyDefinition[]
  senders?: MailAddress[]
  onChange: (filter: MailFilterExpression) => void
  hideImplicitInbox?: boolean
}) {
  const properties = useMailFilterProperties(labels, customProperties, members)
  const [selectedConditionId, setSelectedConditionId] = useState<string | null>(null)
  const conditions = visibleConditions(expression, hideImplicitInbox)
  const selectedCondition = conditions.find((condition) => condition.id === selectedConditionId)

  if (selectedCondition) {
    return (
      <MailFocusedFilterEditor
        condition={selectedCondition}
        onBack={() => setSelectedConditionId(null)}
        onChange={(patch) => onChange(updateCondition(expression, selectedCondition.id, patch, properties))}
        onRemove={() => {
          onChange(removeNode(expression, selectedCondition.id))
          setSelectedConditionId(null)
        }}
        properties={properties}
        senders={senders}
      />
    )
  }

  return (
    <MailFilterPropertyList
      conditions={conditions}
      disabled={conditions.length >= maxMailFilterConditions}
      onCreate={(condition) => {
        onChange(addNode(expression, expression.id, condition))
        setSelectedConditionId(condition.id)
      }}
      onSelect={setSelectedConditionId}
      onToggle={(filter) => {
        onChange(toggleQuickFilter(expression, filter))
      }}
      properties={properties}
    />
  )
}

function MailFilterPropertyList({
  conditions,
  disabled,
  onCreate,
  onSelect,
  onToggle,
  properties,
}: {
  conditions: MailFilterCondition[]
  disabled: boolean
  onCreate: (condition: MailFilterCondition) => void
  onSelect: (conditionId: string) => void
  onToggle: (filter: MailQuickFilter) => void
  properties: PropertyDefinition[]
}) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const quickFilters = primaryMailQuickFilters.filter((filter) => filter.label.toLowerCase().includes(normalizedQuery))
  const additionalProperties = properties.filter((property) =>
    !primaryDirectPropertyIds.has(property.id) &&
    property.label.toLowerCase().includes(normalizedQuery))
  const showMoreFilters = expanded || Boolean(normalizedQuery)

  return (
    <div className="max-h-[min(34rem,calc(100vh-5rem))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-1">
      {conditions.length ? (
        <>
          <div className="px-2 py-1.5 text-xs font-medium text-content-secondary">Active filters</div>
          {conditions.map((condition) => (
            <DropDrawerItem key={condition.id} onSelect={(event) => {
              event.preventDefault()
              onSelect(condition.id)
            }}>
              <span className="truncate">{conditionLabel(condition, properties)}</span>
            </DropDrawerItem>
          ))}
          <DropDrawerSeparator />
        </>
      ) : null}
      <div className="relative m-1">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-content-secondary" />
        <Input aria-label="Filter by" className="h-9 pl-8" onChange={(event) => setQuery(event.target.value)} placeholder="Filter by" value={query} />
      </div>
      {quickFilters.map((filter) => {
        const toggle = isToggleQuickFilter(filter)
        const toggleAction = toggle || isCategoryQuickFilter(filter)
        const existing = toggleAction ? toggleCondition(conditions, filter) : undefined
        const checked = existing ? toggleChecked(existing, filter) : false
        return (
          <DropDrawerItem disabled={disabled && !existing} icon={filter.id === "has_attachments"
            ? <Paperclip className="size-4" />
            : filter.id === "is_unread" ? <MailIcon className="size-4" />
            : toggle ? <Switch aria-label={toggleLabel(existing, filter)} checked={checked} tabIndex={-1} /> : undefined} key={filter.id} onSelect={(event) => {
            event.preventDefault()
            if (toggleAction) {
              onToggle(filter)
              return
            }
            onCreate(createQuickFilterCondition(filter))
          }}>
            {toggleLabel(existing, filter)}
          </DropDrawerItem>
        )
      })}
      {showMoreFilters && additionalProperties.length ? <DropDrawerSeparator /> : null}
      {showMoreFilters ? additionalProperties.map((property) => {
        const linkedFilter = linkedQuickFilterForProperty(property.id)
        const existing = linkedFilter ? toggleCondition(conditions, linkedFilter) : undefined
        return (
          <DropDrawerItem disabled={disabled && !existing} icon={linkedFilter ? <MailIcon className="size-4" /> : undefined} key={property.id} onSelect={(event) => {
            event.preventDefault()
            if (linkedFilter) {
              onToggle(linkedFilter)
              return
            }
            onCreate(defaultConditionForProperty(property.id, properties))
          }}>
            {linkedFilter ? toggleLabel(existing, linkedFilter) : property.label}
          </DropDrawerItem>
        )
      }) : null}
      {!expanded && !normalizedQuery ? (
        <DropDrawerItem onSelect={(event) => {
          event.preventDefault()
          setExpanded(true)
        }}><Plus className="size-4" /> More filters</DropDrawerItem>
      ) : null}
      {normalizedQuery && !quickFilters.length && !additionalProperties.length ? (
        <div className="px-3 py-6 text-center text-sm text-content-secondary">No filters found</div>
      ) : null}
    </div>
  )
}

function MailFocusedFilterEditor({
  condition,
  onBack,
  onChange,
  onRemove,
  properties,
  senders,
}: {
  condition: MailFilterCondition
  onBack: () => void
  onChange: (patch: { operator?: DatabasePropertyFilterOperator; propertyId?: string; values?: string[] }) => void
  onRemove: () => void
  properties: PropertyDefinition[]
  senders: MailAddress[]
}) {
  if (condition.propertyId === "from") {
    return <MailFromFilterEditor condition={condition} onBack={onBack} onChange={onChange} onRemove={onRemove} senders={senders} />
  }

  if (condition.propertyId === "categories") {
    return (
      <MailCategoriesFilterEditor
        condition={condition}
        onBack={onBack}
        onChange={onChange}
        onRemove={onRemove}
        options={properties.find((property) => property.id === "categories")?.valueOptions ?? []}
      />
    )
  }

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] p-1">
      <div className="mb-2 flex items-center gap-2 px-2 py-1 text-sm font-medium text-content-primary">
        <span className="min-w-0 flex-1 truncate">{properties.find((property) => property.id === condition.propertyId)?.label ?? condition.propertyId}</span>
        <Button aria-label="Back to filter list" onClick={onBack} size="icon" type="button" variant="ghost"><XIcon className="size-4" /></Button>
      </div>
      <DatabaseConditionEditor
        condition={toDatabaseCondition(condition, properties)}
        fieldOptions={properties.map(toSearchOption)}
        layout="stacked"
        onUpdate={onChange}
        valueOptions={properties.find((property) => property.id === condition.propertyId)?.valueOptions ?? []}
      />
      <DropDrawerSeparator />
      <Button className="h-9 w-full justify-start gap-2 px-2 text-sm" onClick={onRemove} type="button" variant="ghost">
        <CircleX className="size-4" /> Clear filter
      </Button>
    </div>
  )
}

function MailCategoriesFilterEditor({
  condition,
  onBack,
  onChange,
  onRemove,
  options,
}: {
  condition: MailFilterCondition
  onBack: () => void
  onChange: (patch: { operator?: DatabasePropertyFilterOperator; values?: string[] }) => void
  onRemove: () => void
  options: DatabaseSearchableMenuOption[]
}) {
  const [query, setQuery] = useState("")
  const selectedValues = condition.values.filter((value): value is string => typeof value === "string" && Boolean(value))
  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = options.filter((option) => !normalizedQuery || option.label.toLowerCase().includes(normalizedQuery))
  const operator = ["is_not", "does_not_contain"].includes(condition.operator) ? "does_not_contain" : "contains"

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] p-1">
      <div className="flex items-center gap-1 px-2 py-1">
        <span className="text-sm font-medium text-content-primary">Categories</span>
        <Select value={operator} onValueChange={(value) => onChange({ operator: value as DatabasePropertyFilterOperator })}>
          <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-1 text-sm text-content-secondary shadow-none"><SelectValue /></SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="contains">Contain</SelectItem>
            <SelectItem value="does_not_contain">Do not contain</SelectItem>
          </SelectContent>
        </Select>
        <Button aria-label="Back to filter list" className="ml-auto" onClick={onBack} size="icon" type="button" variant="ghost"><XIcon className="size-4" /></Button>
      </div>
      <div className="relative mx-2 mb-1 mt-1">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-content-secondary" />
        <Input
          aria-label="Search categories"
          autoFocus
          className="h-9 pl-8"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for one or more Categories"
          value={query}
        />
      </div>
      <div className="max-h-80 overflow-y-auto py-1">
        {filteredOptions.length ? filteredOptions.map((option) => {
          const checked = selectedValues.includes(option.value)
          return (
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-action-neutral-hover" key={option.value}>
              <Checkbox checked={checked} onCheckedChange={(nextChecked) => onChange({
                values: nextChecked === true
                  ? [...selectedValues, option.value]
                  : selectedValues.filter((value) => value !== option.value),
              })} />
              <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-content-primary">{option.label}</span>
            </label>
          )
        }) : (
          <div className="px-3 py-6 text-center text-sm text-content-secondary">No categories found</div>
        )}
      </div>
      <DropDrawerSeparator />
      <Button className="h-9 w-full justify-start gap-2 px-2 text-sm" onClick={onRemove} type="button" variant="ghost">
        <CircleX className="size-4" /> Clear filter
      </Button>
    </div>
  )
}

function MailFromFilterEditor({
  condition,
  onBack,
  onChange,
  onRemove,
  senders,
}: {
  condition: MailFilterCondition
  onBack: () => void
  onChange: (patch: { operator?: DatabasePropertyFilterOperator; values?: string[] }) => void
  onRemove: () => void
  senders: MailAddress[]
}) {
  const [query, setQuery] = useState("")
  const senderOptions = useMemo(() => {
    const unique = new Map<string, MailAddress>()
    for (const sender of senders) {
      const address = sender.address.trim().toLowerCase()
      if (address && !unique.has(address)) unique.set(address, sender)
    }
    const normalizedQuery = query.trim().toLowerCase()
    return [...unique.values()]
      .filter((sender) => !normalizedQuery || `${sender.name ?? ""} ${sender.address}`.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => (left.name || left.address).localeCompare(right.name || right.address))
  }, [query, senders])
  const selectedValues = condition.values.filter((value): value is string => typeof value === "string" && Boolean(value))

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] p-1">
      <div className="flex items-center gap-1 px-2 py-1">
        <span className="text-sm font-medium text-content-primary">From</span>
        <Select value={condition.operator} onValueChange={(operator) => onChange({ operator: operator as DatabasePropertyFilterOperator })}>
          <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-1 text-sm text-content-secondary shadow-none"><SelectValue /></SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="contains">Contains</SelectItem>
            <SelectItem value="does_not_contain">Does not contain</SelectItem>
          </SelectContent>
        </Select>
        <Button aria-label="Back to filter list" className="ml-auto" onClick={onBack} size="icon" type="button" variant="ghost"><XIcon className="size-4" /></Button>
      </div>
      <div className="relative mx-2 mb-1">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-content-secondary" />
        <Input aria-label="Search senders" className="h-9 pl-8" onChange={(event) => setQuery(event.target.value)} placeholder="Search people or emails" value={query} />
      </div>
      <div className="max-h-80 overflow-y-auto py-1">
        {senderOptions.length ? senderOptions.map((sender) => {
          const checked = selectedValues.includes(sender.address)
          return (
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-action-neutral-hover" key={sender.address.toLowerCase()}>
              <Checkbox checked={checked} onCheckedChange={(nextChecked) => onChange({
                values: nextChecked === true
                  ? [...selectedValues, sender.address]
                  : selectedValues.filter((value) => value !== sender.address),
              })} />
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-stroke-default bg-surface-subtle text-xs text-content-secondary">
                {(sender.name || sender.address).slice(0, 1).toUpperCase() || <UserIcon className="size-3.5" />}
              </span>
              <span className="min-w-0 truncate text-content-primary">{sender.name || sender.address}</span>
              {sender.name ? <span className="min-w-0 flex-1 truncate text-content-secondary">{sender.address}</span> : null}
            </label>
          )
        }) : (
          <div className="px-3 py-6 text-center text-sm text-content-secondary">No senders found</div>
        )}
      </div>
      <DropDrawerSeparator />
      <Button className="h-9 w-full justify-start gap-2 px-2 text-sm" onClick={onRemove} type="button" variant="ghost">
        <CircleX className="size-4" /> Clear filter
      </Button>
    </div>
  )
}

function MailQuickFilterPicker({ disabled, expression, onChange, properties }: {
  disabled: boolean
  expression: MailFilterExpression
  onChange: (filter: MailFilterExpression) => void
  properties: PropertyDefinition[]
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState("")
  const conditions = flattenConditions(expression)
  const normalizedQuery = query.trim().toLowerCase()
  const quickFilters = primaryMailQuickFilters.filter((filter) => filter.label.toLowerCase().includes(normalizedQuery))
  const additionalProperties = properties.filter((property) =>
    !primaryDirectPropertyIds.has(property.id) &&
    property.label.toLowerCase().includes(normalizedQuery))
  const showMoreFilters = expanded || Boolean(normalizedQuery)
  return (
    <DropDrawer open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen)
      if (!nextOpen) {
        setExpanded(false)
        setQuery("")
      }
    }}>
      <DropDrawerTrigger asChild>
        <Button
          className={cn(
            "rounded-full px-3",
            open && "border-action-selected-border bg-action-selected-subtle text-action-selected-text hover:bg-action-selected-subtle",
          )}
          size="lg"
          type="button"
          variant="secondary"
        ><Plus className="size-4" /> Filter</Button>
      </DropDrawerTrigger>
      <DropDrawerContent align="start" className="max-h-[min(34rem,calc(100vh-5rem))] w-72 overflow-y-auto">
        <div className="relative m-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-content-secondary" />
          <Input aria-label="Filter by" autoFocus className="h-9 pl-8" onChange={(event) => setQuery(event.target.value)} placeholder="Filter by" value={query} />
        </div>
        {quickFilters.map((filter) => {
          const toggle = isToggleQuickFilter(filter)
          const toggleAction = toggle || isCategoryQuickFilter(filter)
          const existing = toggleAction ? toggleCondition(conditions, filter) : undefined
          const checked = existing ? toggleChecked(existing, filter) : false
          return (
            <DropDrawerItem
              disabled={disabled && !existing}
              icon={filter.id === "has_attachments"
                ? <Paperclip className="size-4" />
                : filter.id === "is_unread" ? <MailIcon className="size-4" />
                : toggle ? <Switch aria-label={toggleLabel(existing, filter)} checked={checked} tabIndex={-1} /> : undefined}
              key={filter.id}
              onSelect={(event) => {
                if (toggleAction) {
                  event.preventDefault()
                  onChange(toggleQuickFilter(expression, filter))
                  return
                }
                onChange(addNode(expression, expression.id, createQuickFilterCondition(filter)))
                setOpen(false)
              }}
            >{toggleLabel(existing, filter)}</DropDrawerItem>
          )
        })}
        {showMoreFilters && additionalProperties.length ? <DropDrawerSeparator /> : null}
        {showMoreFilters ? additionalProperties.map((property) => {
          const linkedFilter = linkedQuickFilterForProperty(property.id)
          const existing = linkedFilter ? toggleCondition(conditions, linkedFilter) : undefined
          return (
            <DropDrawerItem disabled={disabled && !existing} icon={linkedFilter ? <MailIcon className="size-4" /> : undefined} key={property.id} onSelect={(event) => {
              if (linkedFilter) {
                event.preventDefault()
                onChange(toggleQuickFilter(expression, linkedFilter))
                return
              }
              onChange(addNode(expression, expression.id, defaultConditionForProperty(property.id, properties)))
              setOpen(false)
            }}>{linkedFilter ? toggleLabel(existing, linkedFilter) : property.label}</DropDrawerItem>
          )
        }) : null}
        {!expanded && !normalizedQuery ? (
          <DropDrawerItem onSelect={(event) => {
            event.preventDefault()
            setExpanded(true)
          }}><Plus className="size-4" /> More filters</DropDrawerItem>
        ) : null}
        {normalizedQuery && !quickFilters.length && !additionalProperties.length ? (
          <div className="px-3 py-6 text-center text-sm text-content-secondary">No filters found</div>
        ) : null}
      </DropDrawerContent>
    </DropDrawer>
  )
}

function useMailFilterProperties(labels: MailLabelRecord[], customProperties: MailPropertyDefinition[], members: MailPropertyWorkspaceMember[]) {
  return useMemo<PropertyDefinition[]>(() => [...mailSystemPropertyCatalog
    .filter((property) => property.filterable && !hiddenMailFilterPropertyIds.has(property.id))
    .map((property) => ({
      id: property.id,
      label: property.label,
      propertyType: property.type === "date" ? "date" : property.type === "files" ? "files" : property.type === "boolean" ? "checkbox" : "text",
      valueOptions: valueOptions(property.id, labels),
    })), ...customProperties.map((property) => ({
      id: property.id,
      label: property.name,
      propertyType: property.type,
      valueOptions: property.type === "person"
        ? members.map((member) => ({ label: member.name || member.email, value: member.id }))
        : property.options.map((option) => ({ label: option.name, value: option.id })),
    }))], [customProperties, labels, members])
}

function valueOptions(propertyId: string, labels: MailLabelRecord[]): DatabaseSearchableMenuOption[] {
  if (["unread", "sent", "archived", "calendar_event", "starred", "priority"].includes(propertyId)) return [{ label: "Yes", value: "true" }, { label: "No", value: "false" }]
  if (propertyId === "categories") return ["primary", "social", "promotions", "updates", "forums"].map((value) => ({ label: value[0]!.toUpperCase() + value.slice(1), value }))
  if (propertyId === "mailbox") return ["inbox", "all_mail", "sent", "drafts", "spam", "bin", "archive"].map((value) => ({ label: value.replaceAll("_", " "), value }))
  if (propertyId === "labels") return labels.map((label) => ({ label: label.name, value: label.id }))
  return []
}

function toSearchOption(property: PropertyDefinition): DatabaseSearchableMenuOption { return { label: property.label, value: property.id } }
function flattenConditions(expression: MailFilterExpression): MailFilterCondition[] { return expression.filters.flatMap((node) => node.type === "condition" ? [node] : flattenConditions(node)) }
function visibleConditions(expression: MailFilterExpression, hideImplicitInbox: boolean) {
  return flattenConditions(expression).filter((condition) => !hideImplicitInbox || !isImplicitInboxCondition(condition))
}
function isImplicitInboxCondition(condition: MailFilterCondition) {
  return condition.propertyId === "mailbox" && condition.operator === "is" && condition.values.length === 1 && condition.values[0] === "inbox"
}
function countConditions(expression: MailFilterExpression) { return flattenConditions(expression).length }
function conditionLabel(condition: MailFilterCondition, properties: PropertyDefinition[]) {
  const property = properties.find((item) => item.id === condition.propertyId)
  const value = condition.values.length ? ` ${condition.values.join(", ")}` : ""
  return `${property?.label ?? condition.propertyId} ${getDatabaseFilterOperatorLabel(condition.operator)}${value}`
}
function conditionPillLabel(condition: MailFilterCondition, properties: PropertyDefinition[]) {
  const quickFilter = mailQuickFilterCatalog.find((filter) => conditionMatchesQuickFilter(condition, filter))
  if (quickFilter) return quickFilter.label
  const property = properties.find((item) => item.id === condition.propertyId)
  if (condition.values.length && ["contains", "is"].includes(condition.operator)) {
    const values = condition.values.map((value) => property?.valueOptions.find((option) => option.value === String(value))?.label ?? String(value)).filter(Boolean)
    if (values.length) return `${property?.label ?? condition.propertyId}: ${values.join(", ")}`
  }
  return conditionLabel(condition, properties)
}
function isToggleQuickFilter(filter: MailQuickFilter) {
  return toggleQuickFilterIds.has(filter.id)
}
function isCategoryQuickFilter(filter: MailQuickFilter) {
  return categoryQuickFilterIds.has(filter.id)
}
function linkedQuickFilterForProperty(propertyId: string) {
  if (propertyId !== "unread") return undefined
  return mailQuickFilterCatalog.find((filter) => filter.id === "is_unread")
}
function toggleCondition(conditions: MailFilterCondition[], filter: MailQuickFilter) {
  if (filter.id === "has_attachments") {
    return conditions.find((condition) => condition.propertyId === "attachments" && ["is_not_empty", "is_empty"].includes(condition.operator))
  }
  if (filter.id === "is_unread") {
    return conditions.find((condition) => condition.propertyId === "unread" && condition.operator === "is" && typeof condition.values[0] === "boolean")
  }
  if (isCategoryQuickFilter(filter)) {
    return conditions.find((condition) => condition.propertyId === "categories" && ["is", "contains"].includes(condition.operator))
  }
  return conditions.find((condition) => conditionMatchesQuickFilter(condition, filter))
}
function toggleChecked(condition: MailFilterCondition, filter: MailQuickFilter) {
  if (filter.id === "has_attachments") return condition.operator === "is_not_empty"
  if (filter.id === "is_unread") return condition.values[0] === true
  return true
}
function toggleLabel(_condition: MailFilterCondition | undefined, filter: MailQuickFilter) {
  if (filter.id === "has_attachments" && _condition) {
    return _condition.operator === "is_not_empty" ? "No attachments" : "Has attachments"
  }
  if (filter.id === "is_unread" && _condition) {
    return _condition.values[0] === true ? "Is read" : "Is unread"
  }
  if (isCategoryQuickFilter(filter) && _condition) {
    const category = String(filter.defaultValues[0] ?? "")
    if (_condition.enabled !== false && _condition.values.includes(category)) {
      return filter.label.replace("Show", "Hide")
    }
  }
  return filter.label
}
function toggleQuickFilter(expression: MailFilterExpression, filter: MailQuickFilter) {
  const existing = toggleCondition(flattenConditions(expression), filter)
  if (isCategoryQuickFilter(filter)) {
    const category = String(filter.defaultValues[0] ?? "")
    if (!existing) {
      return addNode(expression, expression.id, {
        ...createQuickFilterCondition(filter),
        operator: "contains",
        values: [category],
      })
    }
    const selected = existing.enabled !== false && existing.values.includes(category)
    const values = selected
      ? existing.values.filter((value) => value !== category)
      : [...new Set([...existing.values.map(String), category])]
    return mapExpression(expression, (node) => node.type === "condition" && node.id === existing.id
      ? setConditionEnabled({ ...node, operator: "contains", values }, values.length > 0)
      : node)
  }
  if (filter.id === "has_attachments" && existing) {
    return mapExpression(expression, (node) => node.type === "condition" && node.id === existing.id
      ? { ...setConditionEnabled(node, true), operator: node.operator === "is_not_empty" ? "is_empty" : "is_not_empty" }
      : node)
  }
  if (filter.id === "is_unread" && existing) {
    return mapExpression(expression, (node) => node.type === "condition" && node.id === existing.id
      ? { ...setConditionEnabled(node, true), values: [node.values[0] !== true] }
      : node)
  }
  return existing
    ? removeNode(expression, existing.id)
    : addNode(expression, expression.id, createQuickFilterCondition(filter))
}
function conditionMatchesQuickFilter(condition: MailFilterCondition, filter: MailQuickFilter) {
  return condition.propertyId === filter.propertyId &&
    condition.operator === filter.defaultOperator &&
    JSON.stringify(condition.values) === JSON.stringify(filter.defaultValues)
}
function createQuickFilterCondition(filter: MailQuickFilter): MailFilterCondition {
  return {
    id: crypto.randomUUID(),
    operator: filter.defaultOperator,
    propertyId: filter.propertyId,
    type: "condition",
    values: [...filter.defaultValues],
  }
}
function defaultConditionForProperty(propertyId: string, properties: PropertyDefinition[]): MailFilterCondition {
  const property = properties.find((item) => item.id === propertyId)
  const operator = (propertyId === "categories"
    ? "contains"
    : getDatabaseFilterOperatorsForType(property?.propertyType ?? "text")[0]?.value ?? "is") as MailFilterOperator
  return { id: crypto.randomUUID(), operator, propertyId, type: "condition", values: operator === "is_empty" || operator === "is_not_empty" ? [] : [defaultValue(property)] }
}
function defaultValue(property: PropertyDefinition | undefined): MailFilterValue {
  if (property?.propertyType === "checkbox") return true
  return property?.valueOptions[0]?.value ?? ""
}
function toDatabaseCondition(condition: MailFilterCondition, properties: PropertyDefinition[]) {
  const property = properties.find((item) => item.id === condition.propertyId)
  return {
    id: condition.id,
    label: property?.label ?? condition.propertyId,
    operator: condition.operator as DatabasePropertyFilterOperator,
    operatorLabel: getDatabaseFilterOperatorLabel(condition.operator),
    propertyId: condition.propertyId,
    propertyType: property?.propertyType ?? "text",
    values: condition.values.map((value) => String(value ?? "")),
  }
}
function updateCondition(root: MailFilterExpression, id: string, patch: { operator?: DatabasePropertyFilterOperator; propertyId?: string; values?: string[] }, properties: PropertyDefinition[]) {
  return mapExpression(root, (node) => {
    if (node.type !== "condition" || node.id !== id) return node
    const propertyId = patch.propertyId ?? node.propertyId
    const property = properties.find((item) => item.id === propertyId)
    const operator = (patch.propertyId
      ? propertyId === "categories" ? "contains" : getDatabaseFilterOperatorsForType(property?.propertyType ?? "text")[0]?.value
      : patch.operator) ?? node.operator
    const rawValues = patch.propertyId ? [String(defaultValue(property))] : patch.values ?? node.values.map(String)
    const values = rawValues.map((value): MailFilterValue => property?.propertyType === "checkbox" ? value === "true" : property?.propertyType === "number" ? Number(value) : value)
    return { ...node, operator: operator as MailFilterOperator, propertyId, values }
  })
}
function mapExpression(expression: MailFilterExpression, mapper: (node: MailFilterNode) => MailFilterNode): MailFilterExpression {
  return { ...expression, filters: expression.filters.map((node) => {
    const mapped = mapper(node)
    return mapped.type === "group" ? mapExpression(mapped, mapper) : mapped
  }) }
}
function updateGroup(root: MailFilterExpression, id: string, update: (group: MailFilterExpression) => MailFilterExpression): MailFilterExpression {
  if (root.id === id) return update(root)
  return { ...root, filters: root.filters.map((node) => node.type === "group" ? updateGroup(node, id, update) : node) }
}
function addNode(root: MailFilterExpression, groupId: string, node: MailFilterNode) { return updateGroup(root, groupId, (group) => ({ ...group, filters: [...group.filters, node] })) }
function removeNode(root: MailFilterExpression, id: string): MailFilterExpression { return { ...root, filters: root.filters.filter((node) => node.id !== id).map((node) => node.type === "group" ? removeNode(node, id) : node) } }
function toggleConditionEnabled(root: MailFilterExpression, id: string): MailFilterExpression {
  return mapExpression(root, (node) => node.type === "condition" && node.id === id
    ? setConditionEnabled(node, node.enabled === false)
    : node)
}
function setConditionEnabled(condition: MailFilterCondition, enabled: boolean): MailFilterCondition {
  if (!enabled) return { ...condition, enabled: false }
  const activeCondition = { ...condition }
  delete activeCondition.enabled
  return activeCondition
}

export function cloneMailFilter(filter: MailFilterExpression): MailFilterExpression {
  return structuredClone(filter)
}

export function mailFiltersEqual(left: MailFilterExpression, right: MailFilterExpression) {
  return JSON.stringify(left) === JSON.stringify(right)
}
