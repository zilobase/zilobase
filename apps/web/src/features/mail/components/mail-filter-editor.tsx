import { useMemo, useState } from "react"
import {
  mailQuickFilterCatalog,
  mailSystemPropertyCatalog,
  maxMailFilterConditions,
  maxMailFilterDepth,
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
import { DatabaseSearchableMenuItems, type DatabaseSearchableMenuOption } from "@/features/databases/views/view/database-searchable-menu-items"
import { getDatabaseFilterOperatorLabel, getDatabaseFilterOperatorsForType, type DatabasePropertyFilterOperator } from "@/features/databases/views/model/database-view-config"
import { ChevronDown, FilterIcon, Plus, Trash2Icon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

type PropertyDefinition = {
  id: string
  label: string
  propertyType: string
  valueOptions: DatabaseSearchableMenuOption[]
}

export function MailFilterToolbar({
  dirty,
  expression,
  labels,
  members = [],
  properties: customProperties = [],
  onChange,
  onReset,
  onSave,
  onSaveAsNew,
  saving,
}: {
  dirty: boolean
  expression: MailFilterExpression
  labels: MailLabelRecord[]
  members?: MailPropertyWorkspaceMember[]
  properties?: MailPropertyDefinition[]
  onChange: (filter: MailFilterExpression) => void
  onReset: () => void
  onSave: () => void
  onSaveAsNew: () => void
  saving: boolean
}) {
  const properties = useMailFilterProperties(labels, customProperties, members)
  const conditions = flattenConditions(expression)

  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Mail filters">
      {conditions.map((condition) => (
        <span className="inline-flex h-8 max-w-64 items-center gap-1.5 rounded-md bg-surface-subtle px-2 text-xs text-content-primary" key={condition.id}>
          {dirty ? <span aria-label="Unsaved filter" className="size-1.5 shrink-0 rounded-full bg-feedback-warning" /> : null}
          <span className="truncate">{conditionLabel(condition, properties)}</span>
        </span>
      ))}
      <MailQuickFilterPicker
        disabled={countConditions(expression) >= maxMailFilterConditions}
        onSelect={(condition) => onChange(addNode(expression, expression.id, condition))}
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

export function MailFilterEditor({
  expression,
  labels,
  members = [],
  properties: customProperties = [],
  onChange,
}: {
  expression: MailFilterExpression
  labels: MailLabelRecord[]
  members?: MailPropertyWorkspaceMember[]
  properties?: MailPropertyDefinition[]
  onChange: (filter: MailFilterExpression) => void
}) {
  const properties = useMailFilterProperties(labels, customProperties, members)
  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-1">
      <MailFilterGroupEditor
        depth={1}
        expression={expression}
        onChange={onChange}
        properties={properties}
        root={expression}
      />
      {expression.filters.length ? (
        <Button className="h-8 w-full justify-start gap-2 text-xs" onClick={() => onChange({ ...expression, filters: [] })} type="button" variant="ghost">
          <Trash2Icon className="size-4" /> Delete filters
        </Button>
      ) : null}
    </div>
  )
}

function MailFilterGroupEditor({
  depth,
  expression,
  onChange,
  properties,
  root,
}: {
  depth: number
  expression: MailFilterExpression
  onChange: (filter: MailFilterExpression) => void
  properties: PropertyDefinition[]
  root: MailFilterExpression
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const propertyOptions = properties.map(toSearchOption)
  const atConditionLimit = countConditions(root) >= maxMailFilterConditions

  return (
    <div className={depth > 1 ? "rounded-md border border-stroke-default bg-surface-subtle p-2" : "space-y-2"}>
      <div className="mb-2 flex items-center gap-2 px-1 text-xs text-content-secondary">
        <span>{depth === 1 ? "Match" : "Group matches"}</span>
        <Select value={expression.operator} onValueChange={(operator) => onChange(updateGroup(root, expression.id, (group) => ({ ...group, operator: operator as "and" | "or" })))}>
          <SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="and">All</SelectItem><SelectItem value="or">Any</SelectItem></SelectContent>
        </Select>
        <span>conditions</span>
      </div>
      <div className="space-y-2">
        {expression.filters.map((node) => node.type === "group" ? (
          <div className="relative" key={node.id}>
            <MailFilterGroupEditor depth={depth + 1} expression={node} onChange={onChange} properties={properties} root={root} />
            <Button aria-label="Remove filter group" className="absolute right-1 top-1" onClick={() => onChange(removeNode(root, node.id))} size="icon" type="button" variant="ghost"><Trash2Icon className="size-3.5" /></Button>
          </div>
        ) : (
          <DatabaseConditionEditor
            condition={toDatabaseCondition(node, properties)}
            fieldOptions={propertyOptions}
            key={node.id}
            layout="stacked"
            onRemove={() => onChange(removeNode(root, node.id))}
            onUpdate={(patch) => onChange(updateCondition(root, node.id, patch, properties))}
            valueOptions={properties.find((property) => property.id === node.propertyId)?.valueOptions ?? []}
          />
        ))}
      </div>
      {!expression.filters.length ? <div className="rounded-md bg-surface-subtle px-3 py-2 text-xs text-content-secondary">No filters yet</div> : null}
      <div className="mt-2 flex gap-1">
        <DropDrawer open={pickerOpen} onOpenChange={setPickerOpen}>
          <DropDrawerTrigger asChild>
            <Button className="h-8 flex-1 justify-start gap-2 text-xs" disabled={atConditionLimit} type="button" variant="secondary"><Plus className="size-4" /> Add filter</Button>
          </DropDrawerTrigger>
          <DropDrawerContent align="start" className="w-72">
            <DatabaseSearchableMenuItems inputAriaLabel="Add mail filter" inputIcon={<FilterIcon className="size-4" />} inputPlaceholder="Filter by..." onSelect={(propertyId) => {
              onChange(addNode(root, expression.id, defaultConditionForProperty(propertyId, properties)))
              setPickerOpen(false)
            }} open={pickerOpen} options={propertyOptions} pinSearch />
          </DropDrawerContent>
        </DropDrawer>
        {depth < maxMailFilterDepth ? (
          <Button className="h-8 text-xs" disabled={atConditionLimit} onClick={() => onChange(addNode(root, expression.id, { filters: [], id: crypto.randomUUID(), operator: "and", type: "group" }))} type="button" variant="ghost">Add group</Button>
        ) : null}
      </div>
    </div>
  )
}

function MailQuickFilterPicker({ disabled, onSelect, properties }: { disabled: boolean; onSelect: (condition: MailFilterCondition) => void; properties: PropertyDefinition[] }) {
  const [open, setOpen] = useState(false)
  const moreOptions = properties.map(toSearchOption)
  return (
    <DropDrawer open={open} onOpenChange={setOpen}>
      <DropDrawerTrigger asChild>
        <Button disabled={disabled} size="sm" type="button" variant="secondary"><Plus className="size-4" /> Filter</Button>
      </DropDrawerTrigger>
      <DropDrawerContent align="start" className="max-h-[min(34rem,calc(100vh-5rem))] w-72 overflow-y-auto">
        <div className="px-2 py-1.5 text-xs font-medium text-content-secondary">Filter by</div>
        {mailQuickFilterCatalog.map((filter) => (
          <DropDrawerItem key={filter.id} onSelect={() => {
            onSelect({ id: crypto.randomUUID(), operator: filter.defaultOperator, propertyId: filter.propertyId, type: "condition", values: [...filter.defaultValues] })
            setOpen(false)
          }}>{filter.label}</DropDrawerItem>
        ))}
        <DropDrawerSeparator />
        <DropDrawerSub title="More filters">
          <DropDrawerSubTrigger><FilterIcon className="size-4" /> More filters</DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-72">
            <DatabaseSearchableMenuItems inputAriaLabel="Search all mail filters" inputIcon={<FilterIcon className="size-4" />} inputPlaceholder="Filter by..." onSelect={(propertyId) => {
              onSelect(defaultConditionForProperty(propertyId, properties))
              setOpen(false)
            }} options={moreOptions} pinSearch />
          </DropDrawerSubContent>
        </DropDrawerSub>
      </DropDrawerContent>
    </DropDrawer>
  )
}

function useMailFilterProperties(labels: MailLabelRecord[], customProperties: MailPropertyDefinition[], members: MailPropertyWorkspaceMember[]) {
  return useMemo<PropertyDefinition[]>(() => [...mailSystemPropertyCatalog
    .filter((property) => property.filterable)
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
function countConditions(expression: MailFilterExpression) { return flattenConditions(expression).length }
function conditionLabel(condition: MailFilterCondition, properties: PropertyDefinition[]) {
  const property = properties.find((item) => item.id === condition.propertyId)
  const value = condition.values.length ? ` ${condition.values.join(", ")}` : ""
  return `${property?.label ?? condition.propertyId} ${getDatabaseFilterOperatorLabel(condition.operator)}${value}`
}
function defaultConditionForProperty(propertyId: string, properties: PropertyDefinition[]): MailFilterCondition {
  const property = properties.find((item) => item.id === propertyId)
  const operator = (getDatabaseFilterOperatorsForType(property?.propertyType ?? "text")[0]?.value ?? "is") as MailFilterOperator
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
    const operator = (patch.propertyId ? getDatabaseFilterOperatorsForType(property?.propertyType ?? "text")[0]?.value : patch.operator) ?? node.operator
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

export function cloneMailFilter(filter: MailFilterExpression): MailFilterExpression {
  return structuredClone(filter)
}

export function mailFiltersEqual(left: MailFilterExpression, right: MailFilterExpression) {
  return JSON.stringify(left) === JSON.stringify(right)
}
