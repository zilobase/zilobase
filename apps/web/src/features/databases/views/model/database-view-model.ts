import type {
  DatabasePropertyEntity,
  DatabaseRecordEntity,
  DatabaseRow,
  DatabaseViewEntity,
  PagePropertyValueEntity,
} from "@zilobase/features/databases"

import {
  getConfiguredGroupProperty,
  type DatabasePropertyListItem,
  getGroupOptions,
  getKanbanGroupProperty,
  getKanbanOptions,
} from "../kanban/model/database-kanban-config"
import { getDefaultKanbanHiddenPropertyIds } from "../kanban/model/database-kanban-visibility"
import {
  getTimelineDateProperties,
  getTimelineDateProperty,
} from "../timeline/model/database-timeline-config"
import { getDatabaseChartSettings } from "../chart/model/database-chart-config"
import { getPropertyValue, type DatabasePropertyValue } from "../../schema/property-values"
import {
  getDatabaseFilterOperatorLabel,
  getDatabaseConditionalColors,
  getDatabaseFilters,
  getDatabaseLayoutSettings,
  getDatabasePropertyOrder,
  getDatabaseSorts,
  getDatabaseSubItemsSettings,
  getMergedDatabaseConfig,
  getNameColumnLabel,
  getNameColumnShowPageIcon,
  getPropertyHiddenForView,
  getShowPropertyTitles,
  getValidDatabaseFilterOperator,
  isDatabaseFilterGroup,
  type DatabaseFilterItemConfig,
  type DatabasePropertyConfig,
  type DatabasePropertyFilterConfig,
  type DatabaseConditionalColorConfig,
} from "./database-view-config"
import { getDatabaseSubItemsView } from "./database-sub-items"
import type { DatabaseFieldOption } from "./field-option"
import type { DatabaseActiveFilter } from "./filter-sort-contracts";
import type { DatabaseActiveSort } from "./filter-sort-contracts";
import {
  getFilteredDatabaseItems,
  getSortedDatabaseItems,
  hasViewHiddenPropertyIds,
} from "../../interactions/database-item-utils"
import type { DatabaseViewData } from "./database-controller-state"

type PagePersonAccessTargets = {
  members?: Array<{
    email: string
    id: string
    name: string
  }>
}


export function deriveDatabaseViewModel({
  accessTargets,
  activeViewId,
  currentUserId,
  viewData,
}: {
  accessTargets?: PagePersonAccessTargets
  activeViewId: string | null
  currentUserId?: string
  viewData: DatabaseViewData | null | undefined
}) {
  const { propertyValues, properties, items, databaseConfig, activeView } =
    resolveViewSource(viewData, activeViewId)
  const personOptions = getPersonOptions(accessTargets, currentUserId)
  const personOptionsById = new Map(
    personOptions.map((personOption) => [personOption.id, personOption.name])
  )
  const titlePropertyLabel = getNameColumnLabel(databaseConfig)
  const showPageIconInTitle = getNameColumnShowPageIcon(databaseConfig)
  const nameGroupProperty = {
    id: "name",
    position: -1,
    property: {
      config: databaseConfig,
      id: "name",
      name: titlePropertyLabel,
      type: "text",
    },
  }
  const sortFieldOptions = getSortFieldOptions(titlePropertyLabel, properties)
  const activeViewConfig = activeView?.config ?? databaseConfig
  const isKanbanView = activeView?.type === "kanban"
  const isTimelineView = activeView?.type === "timeline"
  const chartSettings = getDatabaseChartSettings(activeViewConfig)
  const layoutSettings = getDatabaseLayoutSettings(activeViewConfig)
  const activeVisibilityConfig = getActiveVisibilityConfig({
    activeViewConfig,
    isKanbanView,
    properties,
  })
  const groupableProperties = [nameGroupProperty, ...properties]
  const visibleProperties = getOrderedDatabaseProperties(
    properties.filter(
      (property) =>
        !getPropertyHiddenForView(
          property.id,
          property.property.config,
          activeVisibilityConfig
        )
    ),
    activeViewConfig
  )
  const showPropertyTitles = getShowPropertyTitles(activeViewConfig)
  const databaseSorts = getDatabaseSorts(activeViewConfig)
  const databaseFilters = getDatabaseFilters(activeViewConfig)
  const databaseConditionalColors = getDatabaseConditionalColors(activeViewConfig)
  const groupProperty = resolveGroupProperty(properties, activeViewConfig, nameGroupProperty)
  const groupOptions = getGroupOptions(groupProperty)
  const kanbanGroupProperty = isKanbanView
    ? groupProperty
    : groupProperty ?? getKanbanGroupProperty(properties, activeViewConfig)
  const kanbanOptions = getKanbanOptions(kanbanGroupProperty)
  const timelineDateProperty = isTimelineView
    ? getTimelineDateProperty(properties, activeViewConfig)
    : null
  const timelineDateProperties = getTimelineDateProperties(properties)
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
  const baseSortedItems = getSortedDatabaseItems(
    filteredItems,
    properties,
    propertyValuesByKey,
    activeDatabaseSorts,
    personOptionsById
  )
  const subItemsSettings = getDatabaseSubItemsSettings(activeViewConfig)
  const subItemsView = getDatabaseSubItemsView({
    filteredRows: filteredItems,
    hasFilters: activeDatabaseFilters.length > 0,
    propertyValuesByKey,
    rows: items,
    settings: subItemsSettings,
    sortedRows: baseSortedItems,
  })
  const sortedItems = subItemsView.rows

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
    chartSettings,
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
    isTimelineView,
    items,
    kanbanGroupProperty,
    timelineDateProperties,
    timelineDateProperty,
    kanbanOptions,
    layoutSettings,
    personOptions,
    properties,
    propertyValues,
    propertyValuesByKey,
    showPageIconInTitle,
    showPropertyTitles,
    sortFieldOptions,
    sortedItems,
    subItemChildRowIdsByParentId: subItemsView.childRowIdsByParentId,
    subItemDepthByRowId: subItemsView.depthByRowId,
    subItemParentRowIdsByRowId: subItemsView.parentRowIdsByRowId,
    subItemsSettings,
    titlePropertyLabel,
    visibleProperties,
    visiblePropertyCount:
      visibleProperties.length + 1,
  }
}

function resolveViewSource(viewData: DatabaseViewData | null | undefined, activeViewId: string | null) {
  const bootstrap = viewData?.bootstrap
  const dataSourceId = viewData?.dataSourceId
  const activeView = resolveActiveView(bootstrap?.views, activeViewId)
  const records = dataSourceId
    ? (viewData?.records ?? []).filter(
      (record) => record.dataSourceId === dataSourceId,
    )
    : []
  return {
    propertyValues: records.flatMap((record) =>
      Object.values(record.valuesByPropertyId)
    ),
    properties: (bootstrap?.properties ?? []).filter(
      (property) => property.dataSourceId === dataSourceId,
    ),
    items: records.map((record, position) => toViewRow(record, position)),
    databaseConfig: bootstrap?.database.config,
    activeView,
  }
}

function toViewRow(record: DatabaseRecordEntity, position: number): DatabaseRow {
  return {
    createdAt: record.createdAt,
    dataSourceId: record.dataSourceId,
    id: record.id,
    page: {
      createdAt: record.page.createdAt,
      deletedAt: record.page.deletedAt,
      id: record.page.id,
      metadata: record.page.metadata,
      name: record.page.name,
      updatedAt: record.page.updatedAt,
    },
    pageId: record.pageId,
    parentRowId: record.parentRowId,
    position,
    updatedAt: record.updatedAt,
  }
}

function resolveActiveView(views: DatabaseViewEntity[] | undefined, activeViewId: string | null) {
  return views?.find(view => view.id === activeViewId) ?? views?.[0] ?? null
}

function resolveGroupProperty(
  properties: DatabasePropertyEntity[], activeViewConfig: unknown,
  nameGroupProperty: DatabasePropertyListItem,
) {
  return activeViewConfig &&
    typeof activeViewConfig === "object" &&
    !Array.isArray(activeViewConfig) &&
    "groupPropertyId" in activeViewConfig &&
    (activeViewConfig as { groupPropertyId?: unknown }).groupPropertyId === "name"
      ? nameGroupProperty
      : getConfiguredGroupProperty(properties, activeViewConfig)

}

function getOrderedDatabaseProperties(
  properties: DatabasePropertyEntity[],
  config: unknown
) {
  const order = getDatabasePropertyOrder(config)

  if (order.length === 0) {
    return properties
  }

  const orderIndexes = new Map(order.map((id, index) => [id, index]))

  return [...properties].sort((left, right) => {
    const leftIndex = orderIndexes.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = orderIndexes.get(right.id) ?? Number.MAX_SAFE_INTEGER

    return leftIndex - rightIndex || left.position - right.position
  })
}

function getPersonOptions(
  accessTargets: PagePersonAccessTargets | undefined,
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
  properties: DatabasePropertyEntity[]
): DatabaseFieldOption[] {
  return [
    {
      fieldIcon: { kind: "name" },
      label: titlePropertyLabel,
      value: "name",
    },
    ...properties.map((property) => {
      return {
        fieldIcon: { kind: "property" as const, propertyType: property.property.type },
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
  properties: DatabasePropertyEntity[]
}) {
  if (!isKanbanView || hasViewHiddenPropertyIds(activeViewConfig)) {
    return activeViewConfig
  }

  return getMergedDatabaseConfig(activeViewConfig, {
    hiddenPropertyIds: getDefaultKanbanHiddenPropertyIds(
      getOrderedDatabaseProperties(properties, activeViewConfig),
      getKanbanGroupProperty(properties, activeViewConfig)?.property.id ?? null
    ),
  })
}

function getActiveDatabaseSorts(
  databaseSorts: ReturnType<typeof getDatabaseSorts>,
  sortFieldOptions: DatabaseFieldOption[]
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
  filterFieldOptions: DatabaseFieldOption[],
  properties: DatabasePropertyEntity[]
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
  filterFieldOptions: DatabaseFieldOption[],
  properties: DatabasePropertyEntity[]
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
  properties: DatabasePropertyEntity[]
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
  properties: DatabasePropertyEntity[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
}) {
  const optionsByField: Record<string, DatabaseFieldOption[]> = {}

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
      optionsByField[property.id] = getFilterChoiceOptions(
        property.property.config,
        getPropertyFilterValues(items, property, propertyValuesByKey)
      )
    }
  }

  return optionsByField
}

function getPropertyFilterValues(
  items: DatabaseRow[],
  property: DatabasePropertyEntity,
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

function getConfiguredPropertyOptions(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return []
  }

  const options = (config as DatabasePropertyConfig).options

  return Array.isArray(options)
    ? options.flatMap((option) =>
        option &&
        typeof option === "object" &&
        typeof option.name === "string"
          ? [{
              ...(typeof option.color === "string" ? { color: option.color } : {}),
              label: option.name,
              value: option.name,
            }]
          : []
      )
    : []
}

function getFilterChoiceOptions(config: unknown, values: string[]) {
  const configuredOptions = getConfiguredPropertyOptions(config)
  const configuredOptionsByValue = new Map(
    configuredOptions.map((option) => [
      option.value.trim().toLocaleLowerCase(),
      option,
    ])
  )

  return getUniqueFilterOptions([
    ...configuredOptions.map((option) => option.value),
    ...values,
  ]).map((option) => ({
    ...option,
    ...configuredOptionsByValue.get(option.value.trim().toLocaleLowerCase()),
  }))
}

function getUniqueFilterOptions(values: string[]): DatabaseFieldOption[] {
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
  properties: DatabasePropertyEntity[]
  propertyValues: PagePropertyValueEntity[]
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
