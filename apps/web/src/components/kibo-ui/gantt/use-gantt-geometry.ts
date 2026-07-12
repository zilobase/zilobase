import { useMemo } from "react"

import { useGanttContext } from "./gantt-context"
import { getTimelineStart, type GanttGeometry } from "./gantt-geometry"

export function useGanttGeometry(): GanttGeometry | null {
  const gantt = useGanttContext()
  const firstYear = gantt.timelineData[0]?.year

  return useMemo(
    () =>
      firstYear === undefined
        ? null
        : {
            columnWidth: (gantt.columnWidth * gantt.zoom) / 100,
            range: gantt.range,
            timelineStart: getTimelineStart(firstYear),
            timelineWidth: gantt.timelineWidth,
          },
    [
      firstYear,
      gantt.columnWidth,
      gantt.range,
      gantt.timelineWidth,
      gantt.zoom,
    ],
  )
}
