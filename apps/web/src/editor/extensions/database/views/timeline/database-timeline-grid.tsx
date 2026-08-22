import { memo, useCallback } from "react"

import {
  GanttAddFeatureRow,
  GanttFeatureItem,
  GanttHeader,
} from "@/components/kibo-ui/gantt"

import type { DatabasePropertyListItem } from "../kanban/database-kanban-config"
import {
  TimelineNameHeaderRow,
  TimelineSidebarRowCell,
  timelineTableStyle,
  type TimelineSidebarRowCellProps,
} from "./database-timeline-sidebar"
import {
  getTimelineViewRowKey,
  type TimelineViewRow,
} from "./database-timeline-rows"
import {
  DEFAULT_TIMELINE_ITEM_DURATION_DAYS,
  type TimelineRowItem,
} from "./database-timeline-config"

type AddTimelineItem = (
  startAt: Date,
  endAt: Date,
  groupValue?: string,
  groupProperty?: DatabasePropertyListItem | null,
) => void

type TimelineGridProps = {
  addTimelineItem: AddTimelineItem
  grouped: boolean
  onMoveItem: (id: string, startAt: Date, endAt: Date | null) => void
  onSelectItem: (rowId: string) => void
  sidebarCellProps: Omit<TimelineSidebarRowCellProps, "viewRow">
  timelineItemsById: Map<string, TimelineRowItem>
  titlePropertyLabel: string
  viewRows: TimelineViewRow[]
}

export const DatabaseTimelineGrid = memo(function DatabaseTimelineGrid({
  addTimelineItem,
  grouped,
  onMoveItem,
  onSelectItem,
  sidebarCellProps,
  timelineItemsById,
  titlePropertyLabel,
  viewRows,
}: TimelineGridProps) {
  return (
    <>
      <TimelineGridBackground />
      <TimelineGridHeader
        grouped={grouped}
        titlePropertyLabel={titlePropertyLabel}
      />

      {viewRows.flatMap((viewRow, index) => {
        const key = getTimelineViewRowKey(viewRow, index)

        return [
          <TimelineSidebarRowCell
            {...sidebarCellProps}
            key={`sidebar-${key}`}
            viewRow={viewRow}
          />,
          <TimelineGridRowCell
            addTimelineItem={addTimelineItem}
            key={`timeline-${key}`}
            onMoveItem={onMoveItem}
            onSelectItem={onSelectItem}
            sidebarCellProps={sidebarCellProps}
            timelineItemsById={timelineItemsById}
            viewRow={viewRow}
          />,
        ]
      })}

      <div
        aria-hidden
        className="database-timeline-sidebar-cell database-timeline-sidebar-fill"
        data-roadmap-ui="gantt-sidebar"
        style={timelineTableStyle}
      />
      <div
        aria-hidden
        className="database-timeline-gantt-cell database-timeline-gantt-fill"
      />
    </>
  )
})

function TimelineGridBackground() {
  return (
    <div className="database-timeline-gantt-grid-overlay">
      <GanttHeader
        className="database-timeline-gantt-grid h-full"
        variant="grid"
      />
    </div>
  )
}

function TimelineGridHeader({
  grouped,
  titlePropertyLabel,
}: {
  grouped: boolean
  titlePropertyLabel: string
}) {
  return (
    <>
      {grouped ? (
        <div
          aria-hidden
          className="database-timeline-sidebar-cell database-timeline-sidebar-header-cell database-timeline-header-spacer"
          data-roadmap-ui="gantt-sidebar"
          style={timelineTableStyle}
        />
      ) : (
        <div
          className="database-timeline-sidebar-cell database-timeline-sidebar-header-cell"
          data-roadmap-ui="gantt-sidebar"
          style={timelineTableStyle}
        >
          <TimelineNameHeaderRow label={titlePropertyLabel} />
        </div>
      )}
      <div className="database-timeline-gantt-header-cell">
        <GanttHeader
          className="database-timeline-gantt-dates"
          variant="dates"
        />
      </div>
    </>
  )
}

const TimelineGridRowCell = memo(function TimelineGridRowCell({
  addTimelineItem,
  onMoveItem,
  onSelectItem,
  sidebarCellProps,
  timelineItemsById,
  viewRow,
}: {
  addTimelineItem: AddTimelineItem
  onMoveItem: TimelineGridProps["onMoveItem"]
  onSelectItem: TimelineGridProps["onSelectItem"]
  sidebarCellProps: TimelineGridProps["sidebarCellProps"]
  timelineItemsById: TimelineGridProps["timelineItemsById"]
  viewRow: TimelineViewRow
}) {
  const addItem = useCallback(
    (startAt: Date, endAt: Date) =>
      addTimelineItem(
        startAt,
        endAt,
        viewRow.kind === "new-page" ? viewRow.section?.groupValue : undefined,
        sidebarCellProps.groupProperty,
      ),
    [addTimelineItem, sidebarCellProps.groupProperty, viewRow],
  )
  const scheduleItem = useCallback(
    (startAt: Date, endAt: Date) => {
      if (viewRow.kind === "item") {
        onMoveItem(viewRow.item.id, startAt, endAt)
      }
    },
    [onMoveItem, viewRow],
  )

  if (viewRow.kind === "new-page") {
    return (
      <div className="database-timeline-gantt-cell database-timeline-add-cell database-timeline-new-page-cell">
        <GanttAddFeatureRow
          aria-label={
            viewRow.section
              ? `Add page to ${viewRow.section.name}`
              : "Add page"
          }
          disabled={
            !sidebarCellProps.databaseId || sidebarCellProps.isAddingDatabaseRow
          }
          durationDays={DEFAULT_TIMELINE_ITEM_DURATION_DAYS}
          onAddItem={addItem}
        />
      </div>
    )
  }

  if (viewRow.kind !== "item") {
    return <div aria-hidden className="database-timeline-gantt-cell" />
  }

  const timelineItem = timelineItemsById.get(viewRow.item.id)

  if (!timelineItem?.feature) {
    return (
      <div
        className="database-timeline-gantt-cell database-timeline-add-cell database-timeline-unscheduled-cell"
        data-timeline-row-id={viewRow.item.id}
      >
        <GanttAddFeatureRow
          aria-label={`Schedule ${timelineItem?.name ?? "Untitled"}`}
          disabled={!sidebarCellProps.databaseId || !sidebarCellProps.editable}
          durationDays={DEFAULT_TIMELINE_ITEM_DURATION_DAYS}
          onAddItem={scheduleItem}
        />
      </div>
    )
  }

  return (
    <div
      className="database-timeline-gantt-cell"
      data-timeline-row-id={viewRow.item.id}
    >
      <GanttFeatureItem
        {...timelineItem.feature}
        className="database-timeline-bar"
        onMove={onMoveItem}
        stacked
      >
        <button
          className="flex h-full w-full items-center px-2 text-left"
          data-open-in-new-tab-href={`/p/${encodeURIComponent(viewRow.item.pageId)}`}
          data-open-in-new-tab-title={timelineItem.name}
          onClick={() => onSelectItem(viewRow.item.id)}
          type="button"
        >
          <span className="truncate text-xs text-muted-foreground">
            {timelineItem.name}
          </span>
        </button>
      </GanttFeatureItem>
    </div>
  )
})
