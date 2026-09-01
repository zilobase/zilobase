import { useMemo, useState } from "react"
import { Reorder } from "motion/react"
import {
  mailCustomPropertyTypes,
  mailSystemPropertyCatalog,
  type MailCustomPropertyType,
  type MailPropertyDefinition,
  type MailPropertyOption,
  type MailPropertyWorkspaceMember,
  type MailThreadPropertyValue,
  type MailViewConfig,
} from "@zilobase/features/mail"

import { databasePropertyTypes, defaultStatusOptions, getDatabasePropertyType } from "@/features/databases/core/database-property-types"
import { PropertyTypePicker } from "@/features/databases/properties/shared/property-type-picker"
import { DataSourcePropertyValueControl } from "@/features/databases/properties/shared/property-value-control"
import { EyeIcon, EyeOffIcon, GripVerticalIcon, Plus, Trash2Icon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DropDrawerSub, DropDrawerSubContent, DropDrawerSubTrigger } from "@/shared/ui/dropdrawer"

const customTypeSet = new Set<string>(mailCustomPropertyTypes)
const mailPropertyTypes = databasePropertyTypes.map((group) => group.filter((property) => customTypeSet.has(property.type)))

export function MailPropertiesPanel({
  config,
  members,
  mutating,
  onConfigChange,
  onCreate,
  onDelete,
  onUpdate,
  properties,
}: {
  config: MailViewConfig
  members: MailPropertyWorkspaceMember[]
  mutating: boolean
  onConfigChange: (config: MailViewConfig) => void
  onCreate: (value: { name: string; options: MailPropertyOption[]; type: MailCustomPropertyType }) => Promise<unknown>
  onDelete: (propertyId: string) => Promise<unknown>
  onUpdate: (input: { propertyId: string; value: { name: string; options: MailPropertyOption[]; type: MailCustomPropertyType } }) => Promise<unknown>
  properties: MailPropertyDefinition[]
}) {
  const [query, setQuery] = useState("")
  const propertyMap = useMemo(() => new Map(properties.map((property) => [property.id, property])), [properties])
  const allIds = [...mailSystemPropertyCatalog.map((property) => property.id), ...properties.map((property) => property.id)]
  const orderedIds = [...config.propertyOrder.filter((id) => allIds.includes(id)), ...allIds.filter((id) => !config.propertyOrder.includes(id))]
  const shownIds = orderedIds.filter((id) => {
    const label = propertyMap.get(id)?.name ?? mailSystemPropertyCatalog.find((property) => property.id === id)?.label ?? id
    return label.toLowerCase().includes(query.trim().toLowerCase())
  })

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] p-1">
      <Input aria-label="Search for a property" className="mb-2" onChange={(event) => setQuery(event.target.value)} placeholder="Search for a property…" value={query} />
      <div className="px-2 pb-1 text-xs font-medium text-content-secondary">Shown in mail list</div>
      <Reorder.Group axis="y" className="space-y-0.5" onReorder={(ids) => onConfigChange({ ...config, propertyOrder: ids })} values={shownIds}>
        {shownIds.map((id) => {
          const custom = propertyMap.get(id)
          const system = mailSystemPropertyCatalog.find((property) => property.id === id)
          const hidden = config.hiddenPropertyIds.includes(id)
          const definition = custom ? getDatabasePropertyType(custom.type) : null
          const Icon = definition?.icon
          const row = (
            <div className="flex h-8 items-center gap-2 rounded-md px-1.5 text-sm text-content-primary hover:bg-action-neutral-hover">
              <GripVerticalIcon className="size-4 cursor-grab text-content-secondary" />
              {Icon ? <Icon className="size-4" /> : null}
              <span className="min-w-0 flex-1 truncate">{custom?.name ?? system?.label ?? id}</span>
              <Button aria-label={`${hidden ? "Show" : "Hide"} ${custom?.name ?? system?.label ?? id}`} onClick={(event) => {
                event.stopPropagation()
                onConfigChange({ ...config, hiddenPropertyIds: hidden ? config.hiddenPropertyIds.filter((item) => item !== id) : [...config.hiddenPropertyIds, id] })
              }} size="icon" type="button" variant="ghost">{hidden ? <EyeOffIcon /> : <EyeIcon />}</Button>
            </div>
          )
          return (
            <Reorder.Item dragListener={!query} key={id} value={id}>
              {custom ? (
                <DropDrawerSub title="Edit property">
                  <DropDrawerSubTrigger className="w-full p-0">{row}</DropDrawerSubTrigger>
                  <DropDrawerSubContent className="w-80"><MailPropertyEditor disabled={mutating} members={members} onDelete={() => onDelete(custom.id)} onSave={(value) => onUpdate({ propertyId: custom.id, value })} property={custom} /></DropDrawerSubContent>
                </DropDrawerSub>
              ) : row}
            </Reorder.Item>
          )
        })}
      </Reorder.Group>
      {!shownIds.length ? <div className="px-2 py-4 text-center text-xs text-content-secondary">No matching properties</div> : null}
      <DropDrawerSub title="Add property">
        <DropDrawerSubTrigger className="mt-1 w-full"><Plus className="size-4" /> Add property</DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-80"><MailPropertyCreator disabled={mutating} onCreate={onCreate} /></DropDrawerSubContent>
      </DropDrawerSub>
    </div>
  )
}

export function MailThreadPropertyBar({
  disabled,
  members,
  onChange,
  properties,
  values,
}: {
  disabled: boolean
  members: MailPropertyWorkspaceMember[]
  onChange: (propertyId: string, value: MailThreadPropertyValue["value"]) => void
  properties: MailPropertyDefinition[]
  values: MailThreadPropertyValue[]
}) {
  const valueMap = new Map(values.map((value) => [value.propertyId, value.value]))
  if (!properties.length) return null
  return (
    <div className="mt-4 grid gap-2 rounded-lg border border-stroke-default bg-surface-raised p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
      {properties.map((property) => {
        const TypeIcon = getDatabasePropertyType(property.type).icon
        return [
          <div className="flex items-center gap-2 text-xs text-content-secondary" key={`${property.id}-label`}><TypeIcon className="size-4" />{property.name}</div>,
          <DataSourcePropertyValueControl disabled={disabled} key={`${property.id}-value`} members={members} onChange={(value) => onChange(property.id, value)} options={property.options} type={property.type} value={valueMap.get(property.id)} />,
        ]
      })}
    </div>
  )
}

function MailPropertyCreator({ disabled, onCreate }: { disabled: boolean; onCreate: Parameters<typeof MailPropertiesPanel>[0]["onCreate"] }) {
  const [name, setName] = useState("")
  return <div className="space-y-2 p-1"><Input aria-label="Property name" onChange={(event) => setName(event.target.value)} placeholder="Property name" value={name} /><PropertyTypePicker onSelect={(type, label) => void onCreate({ name: name.trim() || label, options: defaultOptions(type as MailCustomPropertyType), type: type as MailCustomPropertyType })} placeholder="Search property types" types={mailPropertyTypes} />{disabled ? <div className="text-xs text-content-secondary">Saving…</div> : null}</div>
}

function MailPropertyEditor({ disabled, members, onDelete, onSave, property }: { disabled: boolean; members: MailPropertyWorkspaceMember[]; onDelete: () => Promise<unknown>; onSave: (value: { name: string; options: MailPropertyOption[]; type: MailCustomPropertyType }) => Promise<unknown>; property: MailPropertyDefinition }) {
  const [name, setName] = useState(property.name)
  const [options, setOptions] = useState(property.options)
  const selectLike = ["select", "multi_select", "status"].includes(property.type)
  return (
    <div className="space-y-2 p-2">
      <Input aria-label="Property name" disabled={disabled} onChange={(event) => setName(event.target.value)} value={name} />
      <div className="text-xs text-content-secondary">{getDatabasePropertyType(property.type).label}{property.type === "person" ? ` · ${members.length} workspace members` : ""}</div>
      {selectLike ? <div className="space-y-1">{options.map((option, index) => <div className="flex gap-1" key={option.id}><Input aria-label="Option name" onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} value={option.name} /><Button aria-label="Delete option" onClick={() => setOptions((current) => current.filter((item) => item.id !== option.id))} size="icon" type="button" variant="ghost"><Trash2Icon /></Button></div>)}<Button onClick={() => setOptions((current) => [...current, { color: "gray", id: crypto.randomUUID(), name: "Option" }])} size="sm" type="button" variant="ghost"><Plus /> Add option</Button></div> : null}
      <div className="flex gap-1"><Button disabled={disabled || !name.trim()} onClick={() => void onSave({ name: name.trim(), options, type: property.type })} size="sm" type="button">Save</Button><Button disabled={disabled} onClick={() => { if (window.confirm(`Delete ${property.name}? Thread values will also be removed.`)) void onDelete() }} size="sm" type="button" variant="destructive">Delete</Button></div>
    </div>
  )
}

function defaultOptions(type: MailCustomPropertyType): MailPropertyOption[] {
  return type === "status" ? defaultStatusOptions.map(({ color, id, name }) => ({ color, id, name })) : []
}

export function formatMailPropertyValue(property: MailPropertyDefinition, value: MailThreadPropertyValue["value"] | undefined, members: MailPropertyWorkspaceMember[]) {
  if (value == null || value === "" || Array.isArray(value) && value.length === 0) return ""
  if (property.type === "checkbox") return value === true ? "Checked" : "Unchecked"
  const names = new Map(property.type === "person" ? members.map((member) => [member.id, member.name || member.email]) : property.options.map((option) => [option.id, option.name]))
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? names.get(item) ?? item : item !== null && typeof item === "object" && "name" in item ? item.name : "").filter(Boolean).join(", ")
  return names.get(String(value)) ?? String(value)
}
