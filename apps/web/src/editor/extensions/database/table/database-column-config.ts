import { defaultStatusOptions } from "../constants"

import type {
  DateFormatValue,
  TimeFormatValue,
} from "./database-date-config"

export type DatabaseSelectOption = {
  color?: string
  id: string
  name: string
}

type FilesLimitValue = "one_file" | "no_limit"
type PersonLimitValue = "one_person" | "no_limit"
type PersonDefaultValue = "no_default" | "created_by"
type PersonNotificationsValue = "users_and_groups" | "users_only" | "none"
type SelectOptionSortValue = "manual" | "alphabetical" | "reverse_alphabetical"

export type DatabasePropertyConfig = {
  dateFormat?: DateFormatValue
  defaultOptionId?: string
  filesLimit?: FilesLimitValue
  personDefault?: PersonDefaultValue
  personLimit?: PersonLimitValue
  personNotifications?: PersonNotificationsValue
  selectOptionSort?: SelectOptionSortValue
  showFullUrl?: boolean
  timeFormat?: TimeFormatValue
  wrapContent?: boolean
  options?: DatabaseSelectOption[]
}

type DatabaseConfig = {
  emoji?: string
  nameColumn?: DatabaseNameColumnConfig
  sort?: DatabaseSortConfig
  sorts?: DatabaseSortConfig[]
}

export type DatabaseNameColumnConfig = {
  label?: string
  showPageIcon?: boolean
  wrapContent?: boolean
}

export type DatabaseSortDirection = "ascending" | "descending"

export type DatabaseSortConfig = {
  column: string
  direction: DatabaseSortDirection
}

export function getDatabaseSorts(config: unknown): DatabaseSortConfig[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return []
  }

  const sorts = (config as DatabaseConfig).sorts

  if (Array.isArray(sorts)) {
    return sorts.filter(isDatabaseSortConfig)
  }

  const sort = (config as DatabaseConfig).sort

  return isDatabaseSortConfig(sort) ? [sort] : []
}

export function getMergedDatabaseConfig(
  config: unknown,
  nextConfig: Partial<DatabaseConfig>
) {
  return {
    ...(config && typeof config === "object" && !Array.isArray(config)
      ? config
      : {}),
    ...nextConfig,
  }
}

export function getMergedNameColumnConfig(
  config: unknown,
  nextConfig: DatabaseNameColumnConfig
) {
  return getMergedDatabaseConfig(config, {
    nameColumn: {
      ...getNameColumnConfig(config),
      ...nextConfig,
    },
  })
}

export function getMergedPropertyConfig(
  config: unknown,
  nextConfig: DatabasePropertyConfig
) {
  return {
    ...(config && typeof config === "object" ? config : {}),
    ...nextConfig,
  }
}

export function upsertDatabaseSort(
  sorts: DatabaseSortConfig[],
  nextSort: DatabaseSortConfig
) {
  const existingSortIndex = sorts.findIndex(
    (sort) => sort.column === nextSort.column
  )

  if (existingSortIndex === -1) {
    return [...sorts, nextSort]
  }

  return sorts.map((sort, index) =>
    index === existingSortIndex ? nextSort : sort
  )
}

export function getStatusDefaultOptionId(config: unknown) {
  if (!config || typeof config !== "object" || !("defaultOptionId" in config)) {
    return defaultStatusOptions[0]?.id
  }

  const defaultOptionId = (config as DatabasePropertyConfig).defaultOptionId

  return typeof defaultOptionId === "string"
    ? defaultOptionId
    : defaultStatusOptions[0]?.id
}

export function getShowFullUrl(config: unknown) {
  if (!config || typeof config !== "object" || !("showFullUrl" in config)) {
    return false
  }

  return (config as DatabasePropertyConfig).showFullUrl === true
}

export function getPropertyWrapContent(config: unknown) {
  if (!config || typeof config !== "object" || !("wrapContent" in config)) {
    return false
  }

  return (config as DatabasePropertyConfig).wrapContent === true
}

export function getPersonLimit(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "no_limit"
  }

  const personLimit = (config as DatabasePropertyConfig).personLimit

  return personLimit === "one_person" ? "one_person" : "no_limit"
}

export function getNameColumnLabel(config: unknown) {
  const label = getNameColumnConfig(config).label

  return typeof label === "string" && label.trim().length > 0
    ? label.trim()
    : "Name"
}

export function getNameColumnShowPageIcon(config: unknown) {
  const showPageIcon = getNameColumnConfig(config).showPageIcon

  return showPageIcon !== false
}

export function getNameColumnWrapContent(config: unknown) {
  const wrapContent = getNameColumnConfig(config).wrapContent

  return wrapContent !== false
}

function isDatabaseSortDirection(
  value: unknown
): value is DatabaseSortDirection {
  return value === "ascending" || value === "descending"
}

function isDatabaseSortConfig(value: unknown): value is DatabaseSortConfig {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as DatabaseSortConfig).column === "string" &&
    (value as DatabaseSortConfig).column.length > 0 &&
    isDatabaseSortDirection((value as DatabaseSortConfig).direction)
  )
}

function getNameColumnConfig(config: unknown) {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !("nameColumn" in config)
  ) {
    return {}
  }

  const nameColumn = (config as DatabaseConfig).nameColumn

  return nameColumn && typeof nameColumn === "object" && !Array.isArray(nameColumn)
    ? nameColumn
    : {}
}
