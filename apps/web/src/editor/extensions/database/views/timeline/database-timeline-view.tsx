import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  GanttProvider,
  type Range,
} from "@/components/kibo-ui/gantt"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { getRawDatabaseGroupValue } from "../../interactions/database-group-values"
import { getDatabaseTableGroupSections } from "../../interactions/database-table-group-sections"
import { useDatabaseViewContext } from "../database-view-context"
import {
  buildTimelineRowItem,
  getGanttStatusForValue,
  getTimelineDatePropertyId,
  ganttMoveToCellValue,
  type TimelineRowItem,
} from "./database-timeline-config"
import {
  buildTimelineViewRows,
  getTimelineContentRows,
  getTimelineItems,
  getTimelineViewRowHeight,
  type TimelineGroupSection,
} from "./database-timeline-rows"
import { DatabaseTimelineGrid } from "./database-timeline-grid"
import { DatabaseTimelineSetup } from "./database-timeline-setup"
import { DatabaseTimelineToolbarChrome } from "./database-timeline-toolbar"
import { TimelineRowDragLayer } from "./database-timeline-row-drag-layer"
import { useTimelineRowDrag } from "./database-timeline-row-drag"
import { useTimelineBreakout } from "./use-timeline-breakout"
import { useTimelineRowLayout } from "./use-timeline-row-layout"

export function DatabaseTimelineView() {
  const {
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    addDraggedPageRow,
    addDatabaseRow,
    databaseConfig,
    editable,
    databaseId,
    groupProperty,
    isAddingDatabaseProperty,
    isAddingDatabaseRow,
    items,
    onOpenPage,
    personOptions,
    properties,
    propertyValuesByKey,
    savePropertyValue,
    saveDatabaseSorts,
    setViewDateProperty,
    setupTimelineDateProperty,
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
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const timelineBreakoutStyle = useTimelineBreakout(
    timelineRef,
    !sidebarCollapsed,
    timelineDateProperty?.id,
  )

  const statusProperty = useMemo(
    () =>
      properties.find((property) => property.property.type === "status") ??
      null,
    [properties],
  )
  const configuredDatePropertyId = getTimelineDatePropertyId(activeView?.config)
  const isGrouped = Boolean(groupProperty)
  const isFiltered = activeDatabaseFilters.length > 0
  const isSorted = activeDatabaseSorts.length > 0

  const personOptionsById = useMemo(
    () => new Map(personOptions.map((option) => [option.id, option.name])),
    [personOptions]
  )
  const rowsById = useMemo(
    () => new Map(items.map((row) => [row.id, row])),
    [items],
  )

  const timelineRowById = useMemo(() => {
    if (!timelineDateProperty) {
      return new Map<string, TimelineRowItem>()
    }

    const rows = new Map<string, TimelineRowItem>()
    const statusByValue = new Map<
      string,
      ReturnType<typeof getGanttStatusForValue>
    >()

    for (const row of sortedItems) {
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
      let status = statusByValue.get(statusValue)

      if (!status) {
        status = getGanttStatusForValue(statusValue, statusProperty)
        statusByValue.set(statusValue, status)
      }

      rows.set(
        row.id,
        buildTimelineRowItem({
          dateValue,
          groupName: "",
          rowId: row.id,
          rowName: row.page.name ?? "Untitled",
          pageId: row.pageId,
          status,
        }),
      )
    }

    return rows
  }, [
    propertyValuesByKey,
    sortedItems,
    statusProperty,
    timelineDateProperty,
  ])

  const groupedSections = useMemo<TimelineGroupSection[]>(() => {
    if (!groupProperty) {
      return []
    }

    return getDatabaseTableGroupSections({
      groupProperty,
      personOptionsById,
      propertyValuesByKey,
      rows: sortedItems,
    })
  }, [groupProperty, personOptionsById, propertyValuesByKey, sortedItems])

  const viewRows = useMemo(
    () =>
      getTimelineContentRows(
        buildTimelineViewRows({
          collapsedGroups,
          editable,
          groupProperty,
          items: sortedItems,
          sections: groupedSections,
        }),
        isGrouped
      ),
    [
      collapsedGroups,
      editable,
      groupProperty,
      groupedSections,
      isGrouped,
      sortedItems,
    ]
  )

  const gridTemplateRows = useMemo(
    () =>
      [
        "var(--gantt-header-height)",
        ...viewRows.map(
          (viewRow) => `${getTimelineViewRowHeight(viewRow)}px`
        ),
        "minmax(0, 1fr)",
      ].join(" "),
    [viewRows]
  )

  const visibleRows = useMemo(() => getTimelineItems(viewRows), [viewRows])
  const visibleRowIds = useMemo(
    () => visibleRows.map((row) => row.id),
    [visibleRows],
  )
  const visibleRowIndexById = useMemo(
    () => new Map(visibleRows.map((row, index) => [row.id, index])),
    [visibleRows],
  )

  const rowMeasureKey = useMemo(
    () => ({ gridTemplateRows, sidebarCollapsed, timelineBreakoutStyle }),
    [gridTemplateRows, sidebarCollapsed, timelineBreakoutStyle],
  )
  const {
    getDropTargetIndex: getRowDropTargetIndex,
    handleScroll: handleTimelineScroll,
    layout: rowLayout,
    measureRows,
  } = useTimelineRowLayout({
    measureKey: rowMeasureKey,
    rowIds: visibleRowIds,
    timelineRef,
  })

  const rowDragInput = useMemo(
    () => ({
      addDraggedPageRow,
      databaseId,
      editable,
      getDropTargetIndex: getRowDropTargetIndex,
      groupProperty,
      groupedSections,
      isFiltered,
      isGrouped,
      isSorted,
      items,
      layout: rowLayout,
      measureRows,
      propertyValuesByKey,
      rowsById,
      saveDatabaseSorts,
      sortedItems,
      timelineRef,
      visibleRows,
      visibleRowIndexById,
    }),
    [
      addDraggedPageRow,
      databaseId,
      editable,
      getRowDropTargetIndex,
      groupProperty,
      groupedSections,
      isFiltered,
      isGrouped,
      isSorted,
      items,
      measureRows,
      propertyValuesByKey,
      rowLayout,
      rowsById,
      saveDatabaseSorts,
      sortedItems,
      visibleRows,
      visibleRowIndexById,
    ],
  )
  const rowDrag = useTimelineRowDrag(rowDragInput)

  const handleSelectRow = useCallback(
    (rowId: string) => {
      const row = rowsById.get(rowId)

      if (row?.pageId) {
        onOpenPage?.(row.pageId)
      }
    },
    [onOpenPage, rowsById],
  )

  const handleMoveFeature = useCallback(
    (id: string, startAt: Date, endAt: Date | null) => {
      if (!timelineDateProperty) {
        return
      }

      const row = rowsById.get(id)

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
        ganttMoveToCellValue(startAt, endAt),
      )
    },
    [propertyValuesByKey, rowsById, savePropertyValue, timelineDateProperty],
  )

  const toggleGroupCollapsed = useCallback((sectionId: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }))
  }, [])

  const sidebarCellProps = useMemo(
    () => ({
      collapsedGroups,
      databaseConfig,
      databaseId,
      editable,
      groupProperty,
      isAddingDatabaseRow,
      nameColumnLabel: titlePropertyLabel,
      onAddPage: addDatabaseRow,
      onOpenPage,
      onRowMouseEnter: rowDrag.setHoveredRowId,
      onToggleGroup: toggleGroupCollapsed,
      showPageIcon: showPageIconInTitle,
    }),
    [
      addDatabaseRow,
      collapsedGroups,
      databaseConfig,
      databaseId,
      editable,
      groupProperty,
      isAddingDatabaseRow,
      onOpenPage,
      rowDrag.setHoveredRowId,
      showPageIconInTitle,
      titlePropertyLabel,
      toggleGroupCollapsed,
    ],
  )
  const timelineGridStyle = useMemo(
    () => ({ gridTemplateRows }),
    [gridTemplateRows],
  )
  const timelineToolbar = useMemo(
    () => (
      <DatabaseTimelineToolbarChrome
        onRangeChange={setTimelineRange}
        onSidebarCollapsedChange={setSidebarCollapsed}
        range={timelineRange}
        sidebarCollapsed={sidebarCollapsed}
      />
    ),
    [sidebarCollapsed, timelineRange],
  )

  if (!timelineDateProperty) {
    return (
      <DatabaseTimelineSetup
        configuredDatePropertyId={configuredDatePropertyId}
        dateProperties={timelineDateProperties}
        editable={editable}
        isAddingProperty={isAddingDatabaseProperty}
        onSelectDateProperty={setViewDateProperty}
        onSetupDateProperty={setupTimelineDateProperty}
      />
    )
  }

  return (
    <>
      <div
        className="database-timeline-view min-h-0 flex-1 overflow-visible"
        data-sidebar-collapsed={sidebarCollapsed ? "true" : undefined}
        onDragLeave={rowDrag.handleDragLeave}
        onDragOver={rowDrag.handleDragOver}
        onDrop={rowDrag.handleDrop}
        onMouseLeave={() => {
          if (!rowDrag.draggedRowId) rowDrag.setHoveredRowId(null)
        }}
        onScrollCapture={handleTimelineScroll}
        ref={timelineRef}
        style={timelineBreakoutStyle}
      >
        <TimelineRowDragLayer
          controller={rowDrag}
          editable={editable}
          layout={rowLayout}
          sidebarCollapsed={sidebarCollapsed}
        />
        <GanttProvider
          className="database-timeline-gantt h-full min-h-[28rem]"
          headerHeight={32}
          hideHeaderTitle
          range={timelineRange}
          rowHeight={32}
          scrollClassName="database-timeline-gantt-scroll"
          style={timelineGridStyle}
          toolbar={timelineToolbar}
          zoom={100}
        >
          <DatabaseTimelineGrid
            addTimelineItem={addTimelineRow}
            grouped={isGrouped}
            onMoveItem={handleMoveFeature}
            onSelectItem={handleSelectRow}
            sidebarCellProps={sidebarCellProps}
            timelineItemsById={timelineRowById}
            titlePropertyLabel={titlePropertyLabel}
            viewRows={viewRows}
          />
        </GanttProvider>
      </div>
      <AlertDialog
        open={rowDrag.pendingSortedMove !== null}
        onOpenChange={(open) => {
          if (!open) rowDrag.setPendingSortedMove(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear sorting to reorder?</AlertDialogTitle>
            <AlertDialogDescription>
              Row order is manual. To save this move, Zilobase needs to clear the
              active sorting first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={rowDrag.confirmSortedMove}>
              Clear sorting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
