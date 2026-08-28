import { CalendarPlus } from "@/components/icons"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getDatabasePropertyType } from "../../core/database-property-types"
import type { DatabasePropertyListItem } from "../kanban/database-kanban-config"

export function DatabaseTimelineSetup({
  configuredDatePropertyId,
  dateProperties,
  editable,
  isAddingProperty,
  onSelectDateProperty,
  onSetupDateProperty,
}: {
  configuredDatePropertyId: string | null
  dateProperties: DatabasePropertyListItem[]
  editable: boolean
  isAddingProperty: boolean
  onSelectDateProperty: (propertyId: string) => void
  onSetupDateProperty: () => void
}) {
  if (dateProperties.length === 0) {
    return (
      <div className="database-empty-state flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted-foreground">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">
            Timeline needs a date property
          </span>
          <span>Create one to schedule items on this timeline.</span>
        </div>
        <Select disabled>
          <SelectTrigger className="min-w-56">
            <SelectValue placeholder="No date properties available" />
          </SelectTrigger>
        </Select>
        <Button
          disabled={!editable || isAddingProperty}
          onClick={onSetupDateProperty}
          size="sm"
          type="button"
        >
          <CalendarPlus />
          Set up date property
        </Button>
      </div>
    )
  }
  return (
    <div className="database-empty-state flex flex-col items-center gap-3 px-6 py-10 text-sm text-muted-foreground">
      <span>Schedule this timeline view by</span>
      <Select
        onValueChange={onSelectDateProperty}
        value={configuredDatePropertyId ?? undefined}
      >
        <SelectTrigger className="min-w-56">
          <SelectValue placeholder="Choose a date property" />
        </SelectTrigger>
        <SelectContent align="center">
          {dateProperties.map((property) => {
            const PropertyIcon = getDatabasePropertyType(
              property.property.type,
            ).icon

            return (
              <SelectItem key={property.id} value={property.property.id}>
                <PropertyIcon className="size-4 shrink-0 text-muted-foreground" />
                <span>{property.property.name}</span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
