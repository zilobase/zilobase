import { defaultStatusOptions } from "../core/database-property-types"
import { getRawDatabaseGroupValue } from "./database-group-values"
import type { DatabasePropertyListItem } from "../views/kanban/database-kanban-config"

export type DatabaseTableGroupSection<T> = {
  color?: string
  groupValue: string
  id: string
  isEmpty: boolean
  name: string
  rows: T[]
}

function getConfiguredPropertyOptions(config: unknown) {
  if (!config || typeof config !== "object" || !("options" in config)) {
    return []
  }

  const options = (config as { options?: unknown }).options

  return Array.isArray(options)
    ? options.filter(
        (
          option
        ): option is {
          color?: string
          id: string
          name: string
        } =>
          Boolean(option) &&
          typeof option === "object" &&
          typeof (option as { id?: unknown }).id === "string" &&
          typeof (option as { name?: unknown }).name === "string"
      )
    : []
}

function getRowGroupValue<T extends { page: { name?: string }; pageId: string }>(
  row: T,
  groupProperty: DatabasePropertyListItem,
  propertyValuesByKey: Record<string, string | string[]>
) {
  if (groupProperty.id === "name") {
    return row.page.name?.trim() ?? ""
  }

  const key = `${row.pageId}:${groupProperty.property.id}`
  const value = propertyValuesByKey[key] ?? ""

  return getRawDatabaseGroupValue(value)
}

export function getDatabaseTableGroupSections<T extends {
  page: { name?: string }
  pageId: string
}>({
  groupProperty,
  personOptionsById,
  propertyValuesByKey,
  rows,
}: {
  groupProperty: DatabasePropertyListItem | null
  personOptionsById: Map<string, string>
  propertyValuesByKey: Record<string, string | string[]>
  rows: T[]
}) {
  if (!groupProperty) {
    return []
  }

  const propertyType = groupProperty.property.type
  const configuredOptions =
    propertyType === "status"
      ? getConfiguredPropertyOptions(groupProperty.property.config).length > 0
        ? getConfiguredPropertyOptions(groupProperty.property.config)
        : defaultStatusOptions
      : getConfiguredPropertyOptions(groupProperty.property.config)
  const configuredOptionsByName = new Map(
    configuredOptions.map((option) => [option.name, option])
  )
  const configuredOptionsById = new Map(
    configuredOptions.map((option) => [option.id, option])
  )
  const sectionsById = new Map<string, DatabaseTableGroupSection<T>>()

  const ensureSection = (
    section: Omit<DatabaseTableGroupSection<T>, "rows">
  ) => {
    const existingSection = sectionsById.get(section.id)

    if (existingSection) {
      return existingSection
    }

    const nextSection = { ...section, rows: [] as T[] }
    sectionsById.set(section.id, nextSection)
    return nextSection
  }

  if (configuredOptions.length > 0) {
    configuredOptions.forEach((option) => {
      ensureSection({
        color: option.color,
        groupValue: option.name,
        id: option.id,
        isEmpty: false,
        name: option.name,
      })
    })
  }

  rows.forEach((row) => {
    const rawGroupValue = getRowGroupValue(
      row,
      groupProperty,
      propertyValuesByKey
    )

    if (!rawGroupValue) {
      ensureSection({
        color: "gray",
        groupValue: "",
        id: "empty",
        isEmpty: true,
        name: "Empty",
      }).rows.push(row)
      return
    }

    const configuredOption =
      configuredOptionsByName.get(rawGroupValue) ??
      configuredOptionsById.get(rawGroupValue)
    const groupId = configuredOption?.id ?? rawGroupValue
    const groupName =
      configuredOption?.name ??
      (propertyType === "person"
        ? personOptionsById.get(rawGroupValue) ?? rawGroupValue
        : rawGroupValue)

    ensureSection({
      color: configuredOption?.color,
      groupValue: rawGroupValue,
      id: groupId,
      isEmpty: false,
      name: groupName,
    }).rows.push(row)
  })

  return Array.from(sectionsById.values())
}