import { defaultStatusOptions } from "../../core/database-property-types"
import {
  isReadOnlyPropertyType,
  isSelectLikePropertyType,
} from "../../core/database-property-types"

export type DatabaseSelectOption = {
  color?: string
  id: string
  name: string
}

export type DatabasePropertyListItem = {
  id: string
  position: number
  property: {
    config?: unknown
    id: string
    name: string
    type: string
  }
}

type DatabaseViewConfig = {
  groupPropertyId?: unknown
}

export function isKanbanGroupProperty(property: DatabasePropertyListItem) {
  return Boolean(property.property.id)
}

export function isOptionBackedKanbanGroupProperty(
  property: DatabasePropertyListItem
) {
  return isSelectLikePropertyType(property.property.type)
}

export function isReadOnlyKanbanGroupProperty(
  property: DatabasePropertyListItem
) {
  return isReadOnlyPropertyType(property.property.type)
}

export function canUpdateKanbanGroupProperty(
  property: DatabasePropertyListItem
) {
  return property.id !== "name" && !isReadOnlyKanbanGroupProperty(property)
}

export function canMoveRowsAcrossKanbanGroups(
  property: DatabasePropertyListItem
) {
  return property.id === "name" || canUpdateKanbanGroupProperty(property)
}

export function canCreateRowInKanbanGroup(
  property: DatabasePropertyListItem
) {
  return property.id === "name" || canUpdateKanbanGroupProperty(property)
}

export function canCreateKanbanGroup(property: DatabasePropertyListItem) {
  return (
    property.id === "name" ||
    isOptionBackedKanbanGroupProperty(property) ||
    [
      "date",
      "email",
      "number",
      "phone",
      "text",
      "url",
    ].includes(property.property.type)
  )
}

export function getSelectOptions(config: unknown) {
  if (!config || typeof config !== "object" || !("options" in config)) {
    return []
  }

  const options = (config as { options?: unknown }).options

  if (!Array.isArray(options)) {
    return []
  }

  return options.filter(
    (option): option is DatabaseSelectOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof (option as DatabaseSelectOption).id === "string" &&
      typeof (option as DatabaseSelectOption).name === "string"
  )
}

export function getKanbanGroupPropertyId(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null
  }

  const groupPropertyId = (config as DatabaseViewConfig).groupPropertyId

  return typeof groupPropertyId === "string" && groupPropertyId.length > 0
    ? groupPropertyId
    : null
}

export function getConfiguredGroupProperty(
  properties: DatabasePropertyListItem[],
  config: unknown
) {
  const configuredGroupPropertyId = getKanbanGroupPropertyId(config)

  return configuredGroupPropertyId
    ? properties.find(
        (property) => property.property.id === configuredGroupPropertyId
      ) ?? null
    : null
}

export function getKanbanGroupProperty(
  properties: DatabasePropertyListItem[],
  config: unknown
) {
  const configuredGroupPropertyId = getKanbanGroupPropertyId(config)
  const configuredGroupProperty = configuredGroupPropertyId
    ? properties.find(
        (property) =>
          property.property.id === configuredGroupPropertyId &&
          isKanbanGroupProperty(property)
      ) ?? null
    : null

  return (
    configuredGroupProperty ??
    properties.find((property) => property.property.type === "status") ??
    properties.find((property) =>
      isSelectLikePropertyType(property.property.type)
    ) ??
    properties[0] ??
    null
  )
}

export function getGroupOptions(property: DatabasePropertyListItem | null) {
  if (!property) {
    return []
  }

  const options = getSelectOptions(property.property.config)

  if (options.length > 0) {
    return options
  }

  return property.property.type === "status" ? defaultStatusOptions : []
}

export function getKanbanOptions(property: DatabasePropertyListItem | null) {
  return getGroupOptions(property)
}
