import type {
  DatabasePayload,
  DatabaseProperty,
  DatabaseRow,
  WorkspacePropertyValue,
} from "@notelab/features/databases"

import {
  getConfiguredGroupProperty,
  getGroupOptions,
  getKanbanGroupProperty,
  getKanbanOptions,
} from "../kanban/database-kanban-config"
import { getDatabasePropertyType } from "../constants"
import { getPropertyValue, type DatabasePropertyValue } from "../utils"
import {
  getDatabaseFilterOperatorLabel,
  getDatabaseConditionalColors,
  getDatabaseFilters,
  getDatabaseSorts,
  getMergedDatabaseConfig,
  getNameColumnLabel,
  getNameColumnShowPageIcon,
  getPropertyHiddenForView,
  getValidDatabaseFilterOperator,
  isDatabaseFilterGroup,
  type DatabaseFilterItemConfig,
  type DatabasePropertyConfig,
  type DatabasePropertyFilterConfig,
  type DatabaseConditionalColorConfig,
} from "./database-view-config"
import type { DatabaseSearchableMenuOption } from "./database-searchable-menu-items"
import type { DatabaseActiveFilter } from "./database-filter-menu"
import type { DatabaseActiveSort } from "./database-sort-menu"
import { NameColumnGlyph } from "./name-column-glyph"
import {
  getFilteredDatabaseItems,
  getSortedDatabaseItems,
  hasViewHiddenPropertyIds,
} from "./database-item-utils"

type WorkspacePersonAccessTargets = {
  members?: Array<{
    email: string
    id: string
    name: string
  }>
}

export type DatabaseViewModel = ReturnType<typeof getDatabaseViewModel>

export function getDatabaseViewModel({
  accessTargets,
  activeViewId,
  currentUserId,
  payload,
}: {
  accessTargets?: WorkspacePersonAccessTargets
  activeViewId: string | null
  currentUserId?: string
  payload: DatabasePayload | null | undefined
}) {
  const propertyValues = payload?.values ?? []
  const properties = payload?.properties ?? []
  const items = payload?.rows ?? []
  const personOptions = getPersonOptions(accessTargets, currentUserId)
  const personOptionsById = new Map(
    personOptions.map((personOption) => [personOption.id, personOption.name])
  )
  const titlePropertyLabel = getNameColumnLabel(payload?.database.config)
  const showPageIconInTitle = getNameColumnShowPageIcon(payload?.database.config)
  const activeView =
    payload?.views.find((view) => view.id === activeViewId) ??
    payload?.views[0] ??
    null
  const nameGroupProperty = {
    id: "name",
    position: -1,
    property: {
      config: payload?.database.config,
      id: "name",
      name: titlePropertyLabel,
      type: "text",
    },
  }
  const sortFieldOptions = getSortFieldOptions(titlePropertyLabel, properties)
  const activeViewConfig = activeView?.config ?? payload?.database.config
  const isKanbanView = activeView?.type === "kanban"
  const activeVisibilityConfig = getActiveVisibilityConfig({
    activeViewConfig,
    isKanbanView,
    properties,
  })
  const groupableProperties = [nameGroupProperty, ...properties]
  const visibleProperties = properties.filter(
    (property) =>
      !getPropertyHiddenForView(
        property.id,
        property.property.config,
        activeVisibilityConfig
      )
  )
  const databaseSorts = getDatabaseSorts(activeViewConfig)
  const databaseFilters = getDatabaseFilters(activeViewConfig)
  const databaseConditionalColors = getDatabaseConditionalColors(activeViewConfig)
  const groupProperty =
    activeViewConfig &&
    typeof activeViewConfig === "object" &&
    !Array.isArray(activeViewConfig) &&
    "groupPropertyId" in activeViewConfig &&
    (activeViewConfig as { groupPropertyId?: unknown }).groupPropertyId === "name"
      ? nameGroupProperty
      : getConfiguredGroupProperty(properties, activeViewConfig)
  const groupOptions = getGroupOptions(groupProperty)
  const kanbanGroupProperty = isKanbanView
    ? groupProperty
    : groupProperty ?? getKanbanGroupProperty(properties, activeViewConfig)
  const kanbanOptions = getKanbanOptions(kanbanGroupProperty)
  const activeDatabaseSorts = getActiveDatabaseSorts(
    databaseSorts,
    sortFieldOptions
  )
  const usedSortFieldValues = new Set(
    activeDatabaseSorts.map((sort) => sort.column)
  )
  const addableSortFieldOptions = sortFieldOptions.filter(
    (option) => !usedSortFieldValues.has(option.value)
  )
  const propertyValuesByKey = getPropertyValuesByKey({
    items,
    properties,
    propertyValues,
  })
  const filterFieldOptions = sortFieldOptions
  const activeDatabaseFilters = getActiveDatabaseFilters(
    databaseFilters,
    filterFieldOptions,
    properties
  )
  const activeConditionalColors = getActiveDatabaseConditionalColors(
    databaseConditionalColors,
    filterFieldOptions,
    properties
  )
  const usedFilterFieldValues = new Set(
    activeDatabaseFilters.map((filter) => filter.propertyId)
  )
  const addableFilterFieldOptions = filterFieldOptions.filter(
    (option) => !usedFilterFieldValues.has(option.value)
  )
  const filterValueOptionsByField = getFilterValueOptionsByField({
    items,
    personOptions,
    properties,
    propertyValuesByKey,
  })
  const filteredItems = getFilteredDatabaseItems(
    items,
    properties,
    propertyValuesByKey,
    activeDatabaseFilters,
    personOptionsById
  )
  const sortedItems = getSortedDatabaseItems(
    filteredItems,
    properties,
    propertyValuesByKey,
    activeDatabaseSorts,
    personOptionsById
  )

  return {
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeConditionalColors,
    activeView,
    activeViewConfig,
    activeVisibilityConfig,
    addableFilterFieldOptions,
    addableSortFieldOptions,
    canAddDatabaseFilter: activeDatabaseFilters.length < filterFieldOptions.length,
    canAddDatabaseSort: activeDatabaseSorts.length < sortFieldOptions.length,
    databaseFilters,
    databaseConditionalColors,
    databaseSorts,
    filteredItems,
    filterFieldOptions,
    filterValueOptionsByField,
    groupOptions,
    groupProperty,
    groupableProperties,
    isKanbanView,
    items,
    kanbanGroupProperty,
    kanbanOptions,
    personOptions,
    properties,
    propertyValues,
    propertyValuesByKey,
    showPageIconInTitle,
    sortFieldOptions,
    sortedItems,
    titlePropertyLabel,
    visibleProperties,
    visiblePropertyCount: visibleProperties.length + 1,
  }
}

function getPersonOptions(
  accessTargets: WorkspacePersonAccessTargets | undefined,
  currentUserId: string | undefined
) {
  return (accessTargets?.members ?? []).map((member) => ({
    id: member.id,
    name: member.name || member.email,
    suffix: member.id === currentUserId ? "(you)" : undefined,
  }))
}

function getSortFieldOptions(
  titlePropertyLabel: string,
  properties: DatabaseProperty[]
): DatabaseSearchableMenuOption[] {
  return [
    {
      icon: <NameColumnGlyph />,
      label: titlePropertyLabel,
      value: "name",
    },
    ...properties.map((property) => {
      const PropertyIcon = getDatabasePropertyType(property.property.type).icon

      return {
        icon: <PropertyIcon />,
        label: property.property.name,
        value: property.id,
      }
    }),
  ]
}

function getActiveVisibilityConfig({
  activeViewConfig,
  isKanbanView,
  properties,
}: {
  activeViewConfig: unknown
  isKanbanView: boolean
  properties: DatabaseProperty[]
}) {
  if (!isKanbanView || hasViewHiddenPropertyIds(activeViewConfig)) {
    return activeViewConfig
  }

  return getMergedDatabaseConfig(activeViewConfig, {
    hiddenPropertyIds: properties.map((property) => property.id),
  })
}

function getActiveDatabaseSorts(
  databaseSorts: ReturnType<typeof getDatabaseSorts>,
  sortFieldOptions: DatabaseSearchableMenuOption[]
): DatabaseActiveSort[] {
  return databaseSorts.flatMap((sort) => {
    const option = sortFieldOptions.find(
      (sortOption) => sortOption.value === sort.column
    )

    return option
      ? [
          {
            ...sort,
            label: option.label,
          },
        ]
      : []
  })
}

function getActiveDatabaseFilters(
  databaseFilters: DatabaseFilterItemConfig[],
  filterFieldOptions: DatabaseSearchableMenuOption[],
  properties: DatabaseProperty[]
): DatabaseActiveFilter[] {
  return databaseFilters.flatMap((filter) => {
    if (isDatabaseFilterGroup(filter)) {
      return []
    }

    const option = filterFieldOptions.find(
      (filterOption) => filterOption.value === filter.propertyId
    )

    if (!option) {
      return []
    }

    const propertyType = getFilterPropertyType(filter.propertyId, properties)
    const operator = getValidDatabaseFilterOperator(
      filter.operator,
      propertyType
    )

    return [
      {
        ...filter,
        label: option.label,
        operator,
        operatorLabel: getDatabaseFilterOperatorLabel(operator),
        propertyType,
      },
    ]
  })
}

function getActiveDatabaseConditionalColors(
  conditionalColors: DatabaseConditionalColorConfig[],
  filterFieldOptions: DatabaseSearchableMenuOption[],
  properties: DatabaseProperty[]
) {
  return conditionalColors.flatMap((setting) => {
    const [filter] = getActiveDatabaseFilters(
      [setting.filter],
      filterFieldOptions,
      properties
    )

    return filter
      ? [
          {
            ...setting,
            filter,
          },
        ]
      : []
  })
}

function getFilterPropertyType(
  propertyId: DatabasePropertyFilterConfig["propertyId"],
  properties: DatabaseProperty[]
) {
  if (propertyId === "name") {
    return "text"
  }

  return (
    properties.find((property) => property.id === propertyId)?.property.type ??
    "text"
  )
}

function getFilterValueOptionsByField({
  items,
  personOptions,
  properties,
  propertyValuesByKey,
}: {
  items: DatabaseRow[]
  personOptions: Array<{ id: string; name: string; suffix?: string }>
  properties: DatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
}) {
  const optionsByField: Record<string, DatabaseSearchableMenuOption[]> = {}

  for (const property of properties) {
    const type = property.property.type

    if (type === "checkbox") {
      optionsByField[property.id] = [
        { label: "Checked", value: "Checked" },
        { label: "Unchecked", value: "Unchecked" },
      ]
      continue
    }

    if (type === "person") {
      optionsByField[property.id] = getUniqueFilterOptions([
        ...personOptions.map((person) => person.name),
        ...getPropertyFilterValues(items, property, propertyValuesByKey).map(
          (value) =>
            personOptions.find((person) => person.id === value)?.name ?? value
        ),
      ])
      continue
    }

    if (type === "select" || type === "status" || type === "multi_select") {
      optionsByField[property.id] = getUniqueFilterOptions([
        ...getConfiguredPropertyOptionNames(property.property.config),
        ...getPropertyFilterValues(items, property, propertyValuesByKey),
      ])
    }
  }

  return optionsByField
}

function getPropertyFilterValues(
  items: DatabaseRow[],
  property: DatabaseProperty,
  propertyValuesByKey: Record<string, DatabasePropertyValue>
) {
  return items.flatMap((item) => {
    const value = propertyValuesByKey[`${item.pageId}:${property.property.id}`]

    if (Array.isArray(value)) {
      return value
    }

    return value?.trim() ? [value] : []
  })
}

function getConfiguredPropertyOptionNames(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return []
  }

  const options = (config as DatabasePropertyConfig).options

  return Array.isArray(options)
    ? options.flatMap((option) =>
        option && typeof option === "object" && typeof option.name === "string"
          ? [option.name]
          : []
      )
    : []
}

function getUniqueFilterOptions(values: string[]): DatabaseSearchableMenuOption[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  )
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ label: value, value }))
}

function getPropertyValuesByKey({
  items,
  properties,
  propertyValues,
}: {
  items: DatabaseRow[]
  properties: DatabaseProperty[]
  propertyValues: WorkspacePropertyValue[]
}) {
  const values: Record<string, DatabasePropertyValue> = {}

  for (const row of items) {
    for (const property of properties) {
      values[`${row.pageId}:${property.property.id}`] = getPropertyValue(
        propertyValues,
        row.pageId,
        property.property.id,
        property.property.type
      )
    }
  }

  return values
}
