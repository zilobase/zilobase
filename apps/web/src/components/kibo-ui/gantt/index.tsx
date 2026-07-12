import { getTimelineStart, timelineXToDate } from "./gantt-geometry"
import type { GanttContextProps } from "./gantt-types"

export {
  GanttAddFeatureRow,
  type GanttAddFeatureRowProps,
} from "./gantt-add-row"
export {
  GanttContext,
  useGanttDragging,
  useGanttScrollX,
} from "./gantt-context"
export {
  createInitialTimelineData,
  createTimelineYear,
  getTimelineColumnCount,
} from "./gantt-data"
export {
  GanttColumn,
  GanttColumns,
  GanttContentHeader,
  GanttHeader,
  type GanttColumnProps,
  type GanttColumnsProps,
  type GanttContentHeaderProps,
  type GanttHeaderProps,
} from "./gantt-header"
export {
  GanttCreateMarkerTrigger,
  GanttFeatureDragHelper,
  GanttFeatureItem,
  GanttFeatureItemCard,
  GanttFeatureList,
  GanttFeatureListGroup,
  GanttFeatureRow,
  GanttMarker,
  GanttTimeline,
  GanttToday,
  type GanttCreateMarkerTriggerProps,
  type GanttFeatureDragHelperProps,
  type GanttFeatureItemCardProps,
  type GanttFeatureItemProps,
  type GanttFeatureListGroupProps,
  type GanttFeatureListProps,
  type GanttFeatureRowProps,
  type GanttTimelineProps,
  type GanttTodayProps,
} from "./gantt-interactions"
export {
  dateToTimelineX,
  getGanttColumnWidth,
  getGanttSelection,
  getTimelineItemWidth,
  timelineXToDate,
  type GanttGeometry,
  type GanttRange,
  type GanttSelection,
} from "./gantt-geometry"
export { GanttProvider, type GanttProviderProps } from "./gantt-provider"
export {
  GanttSidebar,
  GanttSidebarGroup,
  GanttSidebarHeader,
  GanttSidebarItem,
  type GanttSidebarGroupProps,
  type GanttSidebarItemProps,
  type GanttSidebarProps,
} from "./gantt-sidebar"
export type {
  GanttContextProps,
  GanttFeature,
  GanttMarkerProps,
  GanttStatus,
  Range,
  TimelineData,
} from "./gantt-types"

export function getDateByTimelinePosition(
  context: GanttContextProps,
  timelineX: number,
): Date {
  const firstYear = context.timelineData[0]?.year
  if (firstYear === undefined) return new Date()

  return timelineXToDate(timelineX, {
    columnWidth: (context.columnWidth * context.zoom) / 100,
    range: context.range,
    timelineStart: getTimelineStart(firstYear),
  })
}
