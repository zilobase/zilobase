import { defaultStatusOption } from "../../../core/database-property-types"
import {
  toStringArray,
  type DatabasePropertyValue as DatabaseCellValue,
} from "../../../core/utils"
import { formatDatabaseDateValue } from "../../../properties/database-date-config"
import type { SortableDatabaseItem } from "../../../interactions/database-item-utils"
import type { DatabasePropertyConfig } from "../../model/database-view-config"
import type {
  DatabasePropertyListItem,
  DatabaseSelectOption,
} from "./database-kanban-config"

export type SelectOptionSortValue = "manual" | "alphabetical" | "reverse_alphabetical"
export type DatabaseRow = SortableDatabaseItem

export type KanbanGroupOption = DatabaseSelectOption & {
  groupValue: string
  isEmpty?: boolean
  isTemporary?: boolean
}

export function getSelectOptionSort(config: unknown): SelectOptionSortValue {
  if (!config || typeof config !== "object" || !("selectOptionSort" in config)) {
    return "manual"
  }

  const sort = (config as DatabasePropertyConfig).selectOptionSort
  return sort === "alphabetical" || sort === "reverse_alphabetical" ? sort : "manual"
}

export function getSortedSelectOptions(
  options: DatabaseSelectOption[],
  sort: SelectOptionSortValue
) {
  if (sort === "manual") return options

  const sortedOptions = [...options].sort((first, second) =>
    first.name.localeCompare(second.name, undefined, { sensitivity: "base" })
  )
  return sort === "reverse_alphabetical" ? sortedOptions.reverse() : sortedOptions
}

function getReadOnlyTimeGroupValue(row: DatabaseRow, propertyType: string) {
  return propertyType === "created_time"
    ? row.page.createdAt ?? row.createdAt
    : row.page.updatedAt ?? row.updatedAt
}

export function getKanbanGroupValues({
  property,
  propertyValuesByKey,
  row,
}: {
  property: DatabasePropertyListItem
  propertyValuesByKey: Record<string, DatabaseCellValue>
  row: DatabaseRow
}) {
  if (property.id === "name") return row.page.name?.trim() ? [row.page.name.trim()] : []

  if (property.property.type === "created_time" || property.property.type === "edited_time") {
    const value = getReadOnlyTimeGroupValue(row, property.property.type)
    return value?.trim() ? [value] : []
  }

  const value = propertyValuesByKey[`${row.pageId}:${property.property.id}`] ?? ""
  if (property.property.type === "checkbox") return [value === "true" ? "true" : "false"]

  const groupValues = toStringArray(value).map((item) => item.trim()).filter(Boolean)
  if (groupValues.length > 0) return groupValues
  return property.property.type === "status" ? [defaultStatusOption.name] : []
}

export function getKanbanGroupLabel({
  groupValue,
  personOptionsById,
  property,
}: {
  groupValue: string
  personOptionsById: Map<string, string>
  property: DatabasePropertyListItem
}) {
  if (!groupValue) return "Empty"
  if (property.property.type === "checkbox") return groupValue === "true" ? "Checked" : "Unchecked"

  if (["date", "created_time", "edited_time"].includes(property.property.type)) {
    return formatDatabaseDateValue(groupValue, property.property.config) || groupValue
  }

  return property.property.type === "person"
    ? personOptionsById.get(groupValue) ?? groupValue
    : groupValue
}

export function getDerivedKanbanGroupId(groupValue: string, propertyType: string) {
  return groupValue ? `${propertyType}:${groupValue}` : "empty"
}
