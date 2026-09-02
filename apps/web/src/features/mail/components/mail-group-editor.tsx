import type { MailGroupConfig, MailPropertyDefinition } from "@zilobase/features/mail"

import { Checkbox } from "@/shared/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

const groupProperties = [
  { label: "None", value: "none" },
  { label: "Date", value: "date" },
  { label: "Starred", value: "starred" },
  { label: "Important", value: "important" },
  { label: "Email", value: "from" },
  { label: "Email domain", value: "email_domain" },
  { label: "Priority", value: "priority" },
  { label: "Label", value: "labels" },
  { label: "Unread", value: "unread" },
] as const

export function MailGroupEditor({
  customProperties = [],
  group,
  onChange,
  saving,
}: {
  customProperties?: MailPropertyDefinition[]
  group: MailGroupConfig | null
  onChange: (group: MailGroupConfig | null) => void
  saving: boolean
}) {
  return (
    <div className="w-72 space-y-3 p-2">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-content-secondary" htmlFor="mail-group-property">Group by</label>
        <Select disabled={saving} value={group?.propertyId ?? "none"} onValueChange={(propertyId) => onChange(propertyId === "none" ? null : {
          direction: "descending",
          hideEmptyGroups: propertyId !== "starred",
          propertyId,
        })}>
          <SelectTrigger id="mail-group-property" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent align="start">
            {groupProperties.map((property) => <SelectItem key={property.value} value={property.value}>{property.label}</SelectItem>)}
            {customProperties.filter(isGroupableCustomProperty).map((property) => <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {group && group.propertyId !== "starred" ? (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-content-secondary" htmlFor="mail-group-direction">Order</label>
            <Select disabled={saving} value={group.direction} onValueChange={(direction) => onChange({ ...group, direction: direction as MailGroupConfig["direction"] })}>
              <SelectTrigger id="mail-group-direction" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="descending">Newest first</SelectItem><SelectItem value="ascending">Oldest first</SelectItem></SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-content-primary">
            <Checkbox checked={group.hideEmptyGroups} disabled={saving} onCheckedChange={(checked) => onChange({ ...group, hideEmptyGroups: checked === true })} />
            Hide empty groups
          </label>
          {!isMutableMailGroup(group.propertyId) ? (
            <p className="text-xs leading-5 text-content-secondary">Threads cannot be moved into Date, Email, or Email domain groups.</p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export function isMutableMailGroup(propertyId: string) {
  return !["date", "received_date", "from", "email_domain"].includes(propertyId)
}

export function isGroupableCustomProperty(property: MailPropertyDefinition) {
  return !["files", "url"].includes(property.type)
}
