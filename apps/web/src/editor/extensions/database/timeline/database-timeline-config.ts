import { addDays } from "date-fns"

import type { GanttFeature, GanttStatus } from "@/components/kibo-ui/gantt"

import { getPaletteColor } from "@/lib/color-tokens"

import { defaultStatusOptions } from "../constants"
import {
  getSelectOptions,
  type DatabasePropertyListItem,
} from "../kanban/database-kanban-config"
import {
  firstScalarValue,
  serializePropertyValue,
  type DatabasePropertyValue,
} from "../utils"

export const UNSCHEDULED_GROUP_NAME = "Unscheduled"

const defaultGanttStatus: GanttStatus = {
  color: getPaletteColor("gray")!,
  id: "unscheduled",
  name: "Unscheduled",
}

type DatabaseViewConfig = {
  datePropertyId?: unknown
}

export type TimelineDateRange = {
  endAt: Date
  startAt: Date
}

export type TimelineRowItem = {
  feature: GanttFeature | null
  groupName: string
  id: string
  name: string
  pageId: string
  status: GanttStatus
}

export function getTimelineDatePropertyId(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null
  }

  const datePropertyId = (config as DatabaseViewConfig).datePropertyId

  return typeof datePropertyId === "string" && datePropertyId.length > 0
    ? datePropertyId
    : null
}

export function getTimelineDateProperties(
  properties: DatabasePropertyListItem[]
) {
  return properties.filter((property) => property.property.type === "date")
}

export function getTimelineDateProperty(
  properties: DatabasePropertyListItem[],
  config: unknown
) {
  const configuredDatePropertyId = getTimelineDatePropertyId(config)
  const configuredDateProperty = configuredDatePropertyId
    ? properties.find(
        (property) => property.property.id === configuredDatePropertyId
      ) ?? null
    : null

  return (
    configuredDateProperty ??
    properties.find((property) => property.property.type === "date") ??
    null
  )
}

export function parseRowDateRange(
  value: DatabasePropertyValue
): TimelineDateRange | null {
  if (Array.isArray(value)) {
    const startValue = value[0]?.trim() ?? ""
    const endValue = value[1]?.trim() ?? ""
    const startAt = startValue ? parseStoredDateValue(startValue) : null
    const endAt = endValue
      ? parseStoredDateValue(endValue)
      : startAt
        ? addDays(startAt, 1)
        : null

    if (!startAt || !endAt) {
      return null
    }

    return { endAt, startAt }
  }

  const scalarValue = firstScalarValue(value).trim()

  if (!scalarValue) {
    return null
  }

  const startAt = parseStoredDateValue(scalarValue)

  if (!startAt) {
    return null
  }

  return {
    endAt: addDays(startAt, 1),
    startAt,
  }
}

export function ganttMoveToCellValue(
  startAt: Date,
  endAt: Date | null
): DatabasePropertyValue {
  const startValue = formatStoredDateValue(startAt)
  const endValue = endAt ? formatStoredDateValue(endAt) : ""

  if (endValue && endValue !== startValue) {
    return [startValue, endValue]
  }

  return startValue
}

export function ganttMoveToDateValue(startAt: Date, endAt: Date | null) {
  return serializePropertyValue("date", ganttMoveToCellValue(startAt, endAt))
}

export function getGanttStatusForValue(
  statusValue: string,
  statusProperty: DatabasePropertyListItem | null
): GanttStatus {
  const normalizedValue = statusValue.trim()

  if (!normalizedValue) {
    return defaultGanttStatus
  }

  const options =
    statusProperty && statusProperty.property.type === "status"
      ? getSelectOptions(statusProperty.property.config)
      : []
  const resolvedOptions =
    options.length > 0 ? options : defaultStatusOptions
  const matchedOption =
    resolvedOptions.find((option) => option.name === normalizedValue) ??
    resolvedOptions.find((option) => option.id === normalizedValue)

  if (!matchedOption) {
    return {
      color: getPaletteColor("gray")!,
      id: normalizedValue,
      name: normalizedValue,
    }
  }

  return {
    color: getPaletteColor(matchedOption.color ?? "gray")!,
    id: matchedOption.id,
    name: matchedOption.name,
  }
}

export function buildTimelineRowItem({
  dateValue,
  groupName,
  rowId,
  rowName,
  pageId,
  status,
}: {
  dateValue: DatabasePropertyValue
  groupName: string
  rowId: string
  rowName: string
  pageId: string
  status: GanttStatus
}): TimelineRowItem {
  const dateRange = parseRowDateRange(dateValue)
  const name = rowName.trim() || "Untitled"

  if (!dateRange) {
    return {
      feature: null,
      groupName,
      id: rowId,
      name,
      pageId,
      status,
    }
  }

  return {
    feature: {
      endAt: dateRange.endAt,
      id: rowId,
      name,
      startAt: dateRange.startAt,
      status,
    },
    groupName,
    id: rowId,
    name,
    pageId,
    status,
  }
}

export function groupTimelineRows(rows: TimelineRowItem[]) {
  const groupedRows = new Map<string, TimelineRowItem[]>()

  for (const row of rows) {
    const existingRows = groupedRows.get(row.groupName) ?? []
    existingRows.push(row)
    groupedRows.set(row.groupName, existingRows)
  }

  return [...groupedRows.entries()]
    .sort(([nameA], [nameB]) => {
      if (nameA === UNSCHEDULED_GROUP_NAME) {
        return 1
      }

      if (nameB === UNSCHEDULED_GROUP_NAME) {
        return -1
      }

      return nameA.localeCompare(nameB)
    })
    .map(([groupName, items]) => ({
      groupName,
      items,
    }))
}

function parseStoredDateValue(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  const localDateTimeMatch = trimmedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  )

  if (localDateTimeMatch) {
    const year = Number(localDateTimeMatch[1])
    const month = Number(localDateTimeMatch[2])
    const day = Number(localDateTimeMatch[3])
    const hours = Number(localDateTimeMatch[4])
    const minutes = Number(localDateTimeMatch[5])
    const date = new Date(year, month - 1, day, hours, minutes)

    return Number.isNaN(date.getTime()) ? null : date
  }

  const dateOnlyMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1])
    const month = Number(dateOnlyMatch[2])
    const day = Number(dateOnlyMatch[3])
    const date = new Date(year, month - 1, day)

    return Number.isNaN(date.getTime()) ? null : date
  }

  const date = new Date(trimmedValue)

  return Number.isNaN(date.getTime()) ? null : date
}

function formatStoredDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}