import { addMonths, format } from "date-fns"
import { ChevronLeft, ChevronRight, ChevronsLeft } from "lucide-react"
import { useContext, useMemo } from "react"

import {
  GanttContext,
  getDateByTimelinePosition,
  useGanttScrollX,
  type Range,
} from "@/components/kibo-ui/gantt"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const rangeOptions: { label: string; value: Range }[] = [
  { label: "Day", value: "daily" },
  { label: "Month", value: "monthly" },
  { label: "Quarter", value: "quarterly" },
]

type DatabaseTimelineToolbarProps = {
  onRangeChange: (range: Range) => void
  onSidebarCollapsedChange: (collapsed: boolean) => void
  range: Range
  sidebarCollapsed: boolean
}

export function DatabaseTimelineToolbarChrome({
  onRangeChange,
  onSidebarCollapsedChange,
  range,
  sidebarCollapsed,
}: DatabaseTimelineToolbarProps) {
  return (
    <div className="database-timeline-toolbar-chrome">
      {!sidebarCollapsed ? (
        <div
          className="database-timeline-toolbar-sidebar-spacer"
          data-roadmap-ui="gantt-sidebar"
        >
          <Button
            aria-label="Collapse sidebar"
            className="database-timeline-toolbar-collapse h-8 w-8 shrink-0 px-0"
            onClick={() => onSidebarCollapsedChange(true)}
            type="button"
            variant="ghost"
          >
            <ChevronsLeft className="size-4" />
          </Button>
        </div>
      ) : null}
      <DatabaseTimelineToolbar
        onRangeChange={onRangeChange}
        onSidebarCollapsedChange={onSidebarCollapsedChange}
        range={range}
        sidebarCollapsed={sidebarCollapsed}
      />
    </div>
  )
}

function DatabaseTimelineToolbar({
  onRangeChange,
  onSidebarCollapsedChange,
  range,
  sidebarCollapsed,
}: DatabaseTimelineToolbarProps) {
  const gantt = useContext(GanttContext)
  const [scrollX] = useGanttScrollX()

  const visibleDate = useMemo(
    () => getDateByTimelinePosition(gantt, scrollX),
    [
      gantt.columnWidth,
      gantt.range,
      gantt.timelineData,
      gantt.zoom,
      scrollX,
    ]
  )

  const scrollTo = (date: Date) => {
    gantt.scrollToDate?.(date)
  }

  const shiftFocus = (direction: -1 | 1) => {
    const nextDate =
      range === "quarterly"
        ? addMonths(visibleDate, direction * 3)
        : addMonths(visibleDate, direction)

    scrollTo(nextDate)
  }

  return (
    <div className="database-timeline-toolbar">
      <div className="database-timeline-toolbar-title-group">
        {sidebarCollapsed ? (
          <Button
            aria-label="Expand sidebar"
            className="database-timeline-toolbar-expand h-8 w-8 shrink-0 px-0"
            onClick={() => onSidebarCollapsedChange(false)}
            type="button"
            variant="ghost"
          >
            <ChevronsLeft className="size-4" />
          </Button>
        ) : null}
        <p className="database-timeline-toolbar-title">
          {format(visibleDate, "MMMM yyyy")}
        </p>
      </div>
      <div className="database-timeline-toolbar-controls">
        <Select
          onValueChange={(value) => onRangeChange(value as Range)}
          value={range}
        >
          <SelectTrigger className="database-timeline-toolbar-range h-8 w-[6.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {rangeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="database-timeline-toolbar-nav h-8 w-8 shrink-0 px-0"
          onClick={() => shiftFocus(-1)}
          type="button"
          variant="ghost"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          className="database-timeline-toolbar-today h-8 px-2.5"
          onClick={() => scrollTo(new Date())}
          type="button"
          variant="ghost"
        >
          Today
        </Button>
        <Button
          className="database-timeline-toolbar-nav h-8 w-8 shrink-0 px-0"
          onClick={() => shiftFocus(1)}
          type="button"
          variant="ghost"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
