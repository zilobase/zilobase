import { useMemo, useState } from "react"
import {
  GanttFeatureItem,
  GanttHeader,
  GanttProvider,
  type Range,
} from "@/components/kibo-ui/gantt"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { getDatabasePropertyType } from "../constants"
import { getRawDatabaseGroupValue } from "../shared/database-group-values"
import { useDatabaseViewContext } from "../shared/database-view-context"
import {
  buildTimelineRowItem,
  getGanttStatusForValue,
  getTimelineDatePropertyId,
  ganttMoveToCellValue,
  type TimelineRowItem,
} from "./database-timeline-config"
import {
  getTimelineBodyEntries,
  getTimelineEntryHeight,
  getTimelineEntryKey,
  getTimelineSidebarEntries,
  TimelineNameHeaderRow,
  TimelineSidebarEntryCell,
  timelineTableStyle,
  type TimelineSidebarEntry,
} from "./database-timeline-sidebar"
import { DatabaseTimelineToolbarChrome } from "./database-timeline-toolbar"

function TimelineGanttEntryCell({
  entry,
  onMoveFeature,
  onSelectRow,
  timelineRowById,
}: {
  entry: TimelineSidebarEntry
  onMoveFeature: (id: string, startAt: Date, endAt: Date | null) => void
  onSelectRow: (rowId: string) => void
  timelineRowById: Map<string, TimelineRowItem>
}) {
  if (entry.type !== "row") {
    return <div aria-hidden className="database-timeline-gantt-cell" />
  }

  const timelineRow = timelineRowById.get(entry.row.id)

  if (!timelineRow?.feature) {
    return (
      <div
        className="database-timeline-gantt-cell"
        data-timeline-row-id={entry.row.id}
      />
    )
  }

  return (
    <div
      className="database-timeline-gantt-cell"
      data-timeline-row-id={entry.row.id}
    >
      <GanttFeatureItem
        {...timelineRow.feature}
        className="database-timeline-bar"
        onMove={onMoveFeature}
        stacked
      >
        <button
          className="flex h-full w-full items-center px-2 text-left"
          onClick={() => onSelectRow(entry.row.id)}
          type="button"
        >
          <span className="truncate text-xs text-foreground/90">
            {timelineRow.name}
          </span>
        </button>
      </GanttFeatureItem>
    </div>
  )
}

export function DatabaseTimelineView() {
  const {
    activeView,
    addDatabaseRow,
    databaseConfig,
    editable,
    databaseId,
    groupProperty,
    isAddingDatabaseRow,
    onOpenPage,
    personOptions,
    properties,
    propertyValuesByKey,
    savePropertyValue,
    setViewDateProperty,
    showPageIconInTitle,
    sortedItems,
    timelineDateProperties,
    timelineDateProperty,
    titlePropertyLabel,
    addTimelineRow,
  } = useDatabaseViewContext()

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(
    {}
  )
  const [timelineRange, setTimelineRange] = useState<Range>("daily")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const statusProperty =
    properties.find((property) => property.property.type === "status") ?? null
  const configuredDatePropertyId = getTimelineDatePropertyId(activeView?.config)
  const isGrouped = Boolean(groupProperty)

  const personOptionsById = useMemo(
    () => new Map(personOptions.map((option) => [option.id, option.name])),
    [personOptions]
  )

  const timelineRowById = useMemo(() => {
    if (!timelineDateProperty) {
      return new Map<string, TimelineRowItem>()
    }

    return new Map(
      sortedItems.map((row) => {
        const dateValue =
          propertyValuesByKey[
            `${row.pageId}:${timelineDateProperty.property.id}`
          ] ?? ""
        const statusValue = statusProperty
          ? getRawDatabaseGroupValue(
              propertyValuesByKey[
                `${row.pageId}:${statusProperty.property.id}`
              ] ?? ""
            )
          : ""
        const status = getGanttStatusForValue(statusValue, statusProperty)

        return [
          row.id,
          buildTimelineRowItem({
            dateValue,
            groupName: "",
            rowId: row.id,
            rowName: row.page.name ?? "Untitled",
            pageId: row.pageId,
            status,
          }),
        ] as const
      })
    )
  }, [
    propertyValuesByKey,
    sortedItems,
    statusProperty,
    timelineDateProperty,
  ])

  const sidebarEntryParams = useMemo(
    () => ({
      collapsedGroups,
      editable,
      groupProperty,
      isGrouped,
      personOptionsById,
      propertyValuesByKey,
      rows: sortedItems,
    }),
    [
      collapsedGroups,
      editable,
      groupProperty,
      isGrouped,
      personOptionsById,
      propertyValuesByKey,
      sortedItems,
    ]
  )

  const bodyEntries = useMemo(
    () =>
      getTimelineBodyEntries(
        getTimelineSidebarEntries(sidebarEntryParams),
        isGrouped
      ),
    [isGrouped, sidebarEntryParams]
  )

  const gridTemplateRows = useMemo(
    () =>
      [
        "var(--gantt-header-height)",
        ...bodyEntries.map(
          (entry) => `${getTimelineEntryHeight(entry)}px`
        ),
      ].join(" "),
    [bodyEntries]
  )

  const handleSelectRow = (rowId: string) => {
    const row = sortedItems.find((item) => item.id === rowId)

    if (row?.pageId) {
      onOpenPage?.(row.pageId)
    }
  }

  const handleMoveFeature = (id: string, startAt: Date, endAt: Date | null) => {
    if (!timelineDateProperty) {
      return
    }

    const row = sortedItems.find((item) => item.id === id)

    if (!row) {
      return
    }

    const key = `${row.pageId}:${timelineDateProperty.property.id}`
    const currentValue = propertyValuesByKey[key] ?? ""
    savePropertyValue(
      row.id,
      timelineDateProperty.property.id,
      "date",
      currentValue,
      ganttMoveToCellValue(startAt, endAt)
    )
  }

  const toggleGroupCollapsed = (sectionId: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }))
  }

  const sidebarCellProps = {
    collapsedGroups,
    databaseConfig,
    databaseId,
    editable,
    groupProperty,
    isAddingDatabaseRow,
    nameColumnLabel: titlePropertyLabel,
    onAddPage: addDatabaseRow,
    onOpenPage,
    onToggleGroup: toggleGroupCollapsed,
    showPageIcon: showPageIconInTitle,
  }

  if (!timelineDateProperty) {
    return (
      <div className="database-empty-state flex flex-col items-center gap-3 px-6 py-10 text-sm text-muted-foreground">
        <span>Schedule this timeline view by</span>
        <Select
          onValueChange={setViewDateProperty}
          value={configuredDatePropertyId ?? undefined}
        >
          <SelectTrigger className="min-w-56">
            <SelectValue placeholder="Choose a date property" />
          </SelectTrigger>
          <SelectContent align="center">
            {timelineDateProperties.map((property) => {
              const PropertyIcon = getDatabasePropertyType(property.property.type)
                .icon

              return (
                <SelectItem key={property.id} value={property.property.id}>
                  <PropertyIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span>{property.property.name}</span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <div
      className="database-timeline-view min-h-0 flex-1 overflow-hidden"
      data-sidebar-collapsed={sidebarCollapsed ? "true" : undefined}
    >
      <GanttProvider
        className="database-timeline-gantt h-full min-h-[28rem]"
        headerHeight={32}
        hideHeaderTitle
        onAddItem={addTimelineRow}
        range={timelineRange}
        rowHeight={32}
        scrollClassName="database-timeline-gantt-scroll"
        style={{ gridTemplateRows }}
        toolbar={
          <DatabaseTimelineToolbarChrome
            onRangeChange={setTimelineRange}
            onSidebarCollapsedChange={setSidebarCollapsed}
            range={timelineRange}
            sidebarCollapsed={sidebarCollapsed}
          />
        }
        zoom={100}
      >
        <div className="database-timeline-gantt-grid-overlay">
          <GanttHeader
            className="database-timeline-gantt-grid h-full"
            variant="grid"
          />
        </div>

        {isGrouped ? (
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

        {bodyEntries.flatMap((entry, index) => {
          const key = getTimelineEntryKey(entry, index)

          return [
            <TimelineSidebarEntryCell
              {...sidebarCellProps}
              entry={entry}
              key={`sidebar-${key}`}
            />,
            <TimelineGanttEntryCell
              entry={entry}
              key={`gantt-${key}`}
              onMoveFeature={handleMoveFeature}
              onSelectRow={handleSelectRow}
              timelineRowById={timelineRowById}
            />,
          ]
        })}
      </GanttProvider>
    </div>
  )
}