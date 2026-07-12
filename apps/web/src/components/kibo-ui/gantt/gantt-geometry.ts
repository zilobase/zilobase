import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  getDaysInMonth,
  startOfDay,
  startOfMonth,
} from "date-fns"

export type GanttRange = "daily" | "monthly" | "quarterly"

export type GanttGeometry = {
  columnWidth: number
  range: GanttRange
  timelineStart: Date
  timelineWidth: number
}

export type GanttSelection = {
  endAt: Date
  left: number
  startAt: Date
  width: number
}

export function getGanttColumnWidth(
  range: GanttRange,
  zoom: number,
): number {
  const baseWidth = range === "daily" ? 50 : range === "monthly" ? 150 : 100
  return (baseWidth * zoom) / 100
}

export function getTimelineStart(year: number): Date {
  return new Date(year, 0, 1)
}

export function dateToTimelineX(
  date: Date,
  geometry: Pick<GanttGeometry, "columnWidth" | "range" | "timelineStart">,
): number {
  const { columnWidth, range, timelineStart } = geometry

  if (range === "daily") {
    return (
      differenceInCalendarDays(startOfDay(date), startOfDay(timelineStart)) *
      columnWidth
    )
  }

  const monthStart = startOfMonth(date)
  const fullMonths = differenceInCalendarMonths(
    monthStart,
    startOfMonth(timelineStart),
  )
  const elapsedDays = date.getDate() - 1
  const monthProgress = elapsedDays / getDaysInMonth(date)

  return (fullMonths + monthProgress) * columnWidth
}

export function timelineXToDate(
  timelineX: number,
  geometry: Pick<GanttGeometry, "columnWidth" | "range" | "timelineStart">,
): Date {
  const { columnWidth, range, timelineStart } = geometry
  const safeX = Math.max(0, timelineX)
  const columnIndex = Math.floor(safeX / columnWidth)

  if (range === "daily") {
    return addDays(startOfDay(timelineStart), columnIndex)
  }

  const month = addMonths(startOfMonth(timelineStart), columnIndex)
  const positionInMonth = (safeX % columnWidth) / columnWidth
  const dayOffset = Math.min(
    getDaysInMonth(month) - 1,
    Math.floor(positionInMonth * getDaysInMonth(month)),
  )

  return addDays(month, dayOffset)
}

export function getTimelineItemWidth(
  startAt: Date,
  endAt: Date | null,
  geometry: Pick<GanttGeometry, "columnWidth" | "range" | "timelineStart">,
): number {
  if (!endAt) {
    return geometry.columnWidth * 2
  }

  const measuredWidth =
    dateToTimelineX(endAt, geometry) - dateToTimelineX(startAt, geometry)
  if (measuredWidth > 0) return measuredWidth

  return geometry.range === "daily"
    ? geometry.columnWidth
    : geometry.columnWidth / getDaysInMonth(startAt)
}

export function getGanttSelection(
  timelineX: number,
  durationDays: number,
  geometry: GanttGeometry,
): GanttSelection {
  const startAt = timelineXToDate(timelineX, geometry)
  const endAt = addDays(startAt, Math.max(1, durationDays))
  const width = getTimelineItemWidth(startAt, endAt, geometry)
  const unclampedLeft = dateToTimelineX(startAt, geometry)
  const left = Math.min(
    Math.max(0, geometry.timelineWidth - width),
    Math.max(0, unclampedLeft),
  )

  return { endAt, left, startAt, width }
}

export function getTimelineXFromElement(
  element: HTMLElement,
  clientX: number,
): number {
  const rect = element.getBoundingClientRect()
  return Math.max(0, Math.min(rect.width - 1, clientX - rect.left))
}

export function getTimelineXFromViewport(
  clientX: number,
  scrollElement: HTMLElement,
  sidebarWidth: number,
): number {
  const rect = scrollElement.getBoundingClientRect()
  return Math.max(
    0,
    clientX - rect.left + scrollElement.scrollLeft - sidebarWidth,
  )
}
