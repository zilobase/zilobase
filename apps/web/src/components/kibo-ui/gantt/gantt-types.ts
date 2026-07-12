import type { RefObject } from "react"

import type { GanttRange } from "./gantt-geometry"

export type GanttStatus = {
  color: string
  id: string
  name: string
}

export type GanttFeature = {
  endAt: Date
  id: string
  lane?: string
  name: string
  startAt: Date
  status: GanttStatus
}

export type GanttMarkerProps = {
  date: Date
  id: string
  label: string
}

export type Range = GanttRange

export type TimelineData = {
  quarters: {
    months: {
      days: number
    }[]
  }[]
  year: number
}[]

export type GanttContextProps = {
  columnWidth: number
  headerHeight: number
  hideHeaderTitle: boolean
  placeholderLength: number
  range: Range
  ref: RefObject<HTMLDivElement | null> | null
  rowHeight: number
  scrollToDate?: (date: Date) => void
  scrollToFeature?: (feature: GanttFeature) => void
  sidebarWidth: number
  timelineData: TimelineData
  timelineWidth: number
  zoom: number
}
