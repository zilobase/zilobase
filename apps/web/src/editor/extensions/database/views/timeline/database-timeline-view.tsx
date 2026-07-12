import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"
import { CalendarPlus, FileText, GripVertical } from "lucide-react"
import { toast } from "sonner"
import {
  useMoveDatabaseRow,
  useReorderDatabaseRows,
} from "@notelab/features/databases"
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
import { Button } from "@/components/ui/button"
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

import { DATABASE_PAGE_DRAG_MIME } from "../../core/database-contracts"
import { getDatabasePropertyType } from "../../core/database-property-types"
import { serializePropertyValue } from "../../core/utils"
import {
  getDatabaseGroupMoveValue,
  getRawDatabaseGroupValue,
} from "../../interactions/database-group-values"
import {
  getDatabaseTableGroupSections,
  type DatabaseTableGroupSection,
} from "../../interactions/database-table-group-sections"
import type { SortableDatabaseItem } from "../../interactions/database-item-utils"
import {
  finishDatabaseRowDrag,
  getAnchoredReorderedRowIds,
  getFilteredReorderedRowIds,
  getReorderedRowIds,
  hideNativeDatabaseRowDragPreview,
  startDatabaseRowDrag,
  type DatabaseRowDragOverlay,
} from "../../interactions/database-row-drag"
import { useDatabaseViewContext } from "../database-view-context"
import { canUpdateKanbanGroupProperty } from "../kanban/database-kanban-config"
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
import { useTimelineBreakout } from "./use-timeline-breakout"

type TimelineGroupSection = DatabaseTableGroupSection<SortableDatabaseItem>

type TimelineRowMove = {
  groupPropertyId?: string
  groupValue?: unknown
  rowId: string
  rowIds: string[]
}

type TimelineRowLayout = {
  centers: Record<string, number>
  dropTops: number[]
}

const emptyTimelineRowLayout: TimelineRowLayout = {
  centers: {},
  dropTops: [],
}

function getTimelineRowTitle(row: SortableDatabaseItem) {
  return row.page.name.trim() || "Untitled"
}

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
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
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
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null)
  const [rowDropTargetIndex, setRowDropTargetIndex] = useState<number | null>(
    null,
  )
  const [rowDragOverlay, setRowDragOverlay] =
    useState<DatabaseRowDragOverlay | null>(null)
  const [pendingSortedRowMove, setPendingSortedRowMove] =
    useState<TimelineRowMove | null>(null)
  const [rowLayout, setRowLayout] = useState<TimelineRowLayout>(
    emptyTimelineRowLayout,
  )
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const moveRow = useMoveDatabaseRow()
  const reorderRows = useReorderDatabaseRows()
  const timelineBreakoutStyle = useTimelineBreakout(
    timelineRef,
    !sidebarCollapsed,
    timelineDateProperty?.id,
  )

  const statusProperty =
    properties.find((property) => property.property.type === "status") ?? null
  const configuredDatePropertyId = getTimelineDatePropertyId(activeView?.config)
  const isGrouped = Boolean(groupProperty)
  const isFiltered = activeDatabaseFilters.length > 0
  const isSorted = activeDatabaseSorts.length > 0

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
        "minmax(0, 1fr)",
      ].join(" "),
    [bodyEntries]
  )

  const visibleRows = useMemo(
    () =>
      bodyEntries.flatMap((entry) => (entry.type === "row" ? [entry.row] : [])),
    [bodyEntries],
  )
  const visibleRowIndexById = useMemo(
    () => new Map(visibleRows.map((row, index) => [row.id, index])),
    [visibleRows],
  )
  const rowsById = useMemo(
    () => new Map(items.map((row) => [row.id, row])),
    [items],
  )
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
  const groupSectionByRowId = useMemo(() => {
    const sectionsByRowId = new Map<string, TimelineGroupSection>()

    groupedSections.forEach((section) => {
      section.rows.forEach((row) => sectionsByRowId.set(row.id, section))
    })

    return sectionsByRowId
  }, [groupedSections])

  const measureRows = useCallback(() => {
    const timeline = timelineRef.current

    if (!timeline) {
      return emptyTimelineRowLayout
    }

    const timelineRect = timeline.getBoundingClientRect()
    const rowElements = Array.from(
      timeline.querySelectorAll<HTMLElement>(
        ".database-timeline-sidebar-row[data-timeline-row-id]",
      ),
    )
    const centers: Record<string, number> = {}
    const dropTops: number[] = []

    rowElements.forEach((rowElement, index) => {
      const rect = rowElement.getBoundingClientRect()
      const top = rect.top - timelineRect.top
      const rowId = rowElement.dataset.timelineRowId

      if (rowId) centers[rowId] = top + rect.height / 2
      dropTops[index] = top
      if (index === rowElements.length - 1) {
        dropTops[index + 1] = top + rect.height
      }
    })

    const nextLayout = { centers, dropTops }
    setRowLayout(nextLayout)
    return nextLayout
  }, [])

  useLayoutEffect(() => {
    measureRows()
    const timeline = timelineRef.current

    if (!timeline || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureRows)
      return () => window.removeEventListener("resize", measureRows)
    }

    const observer = new ResizeObserver(measureRows)
    observer.observe(timeline)
    window.addEventListener("resize", measureRows)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measureRows)
    }
  }, [bodyEntries, measureRows, sidebarCollapsed, timelineBreakoutStyle])

  const getRowDropTargetIndex = (clientY: number) => {
    const timeline = timelineRef.current

    if (!timeline || visibleRows.length === 0) return 0

    const rowElements = Array.from(
      timeline.querySelectorAll<HTMLElement>(
        ".database-timeline-sidebar-row[data-timeline-row-id]",
      ),
    )
    const targetIndex = rowElements.findIndex((rowElement) => {
      const rect = rowElement.getBoundingClientRect()
      return clientY < rect.top + rect.height / 2
    })

    return targetIndex === -1 ? rowElements.length : targetIndex
  }

  const getRowMove = (): TimelineRowMove | null => {
    if (draggedRowId === null || rowDropTargetIndex === null) return null

    if (!isGrouped) {
      const rowIds = isFiltered
        ? getFilteredReorderedRowIds(
            items,
            sortedItems,
            draggedRowId,
            rowDropTargetIndex,
          )
        : getReorderedRowIds(
            isSorted ? sortedItems : items,
            draggedRowId,
            rowDropTargetIndex,
          )

      return rowIds ? { rowId: draggedRowId, rowIds } : null
    }

    const sourceSection = groupSectionByRowId.get(draggedRowId)
    const targetRow =
      visibleRows[Math.min(rowDropTargetIndex, visibleRows.length - 1)]
    const targetSection = targetRow
      ? groupSectionByRowId.get(targetRow.id)
      : groupedSections.at(-1)

    if (!sourceSection || !targetSection) return null

    const rowsBeforeTarget = visibleRows.slice(0, rowDropTargetIndex)
    const localTargetIndex = rowsBeforeTarget.filter(
      (row) => groupSectionByRowId.get(row.id)?.id === targetSection.id,
    ).length

    if (sourceSection.id === targetSection.id) {
      const rowIds = getFilteredReorderedRowIds(
        items,
        targetSection.rows,
        draggedRowId,
        localTargetIndex,
      )
      return rowIds ? { rowId: draggedRowId, rowIds } : null
    }

    if (!groupProperty || !canUpdateKanbanGroupProperty(groupProperty)) {
      return null
    }

    const draggedRow = rowsById.get(draggedRowId)
    if (!draggedRow) return null

    const rowIds =
      getAnchoredReorderedRowIds(
        items,
        draggedRowId,
        targetSection.rows,
        localTargetIndex,
      ) ?? items.map((row) => row.id)
    const key = `${draggedRow.pageId}:${groupProperty.property.id}`
    const currentValue = propertyValuesByKey[key] ?? ""
    const nextValue = getDatabaseGroupMoveValue({
      currentValue,
      propertyType: groupProperty.property.type,
      sourceGroupValue: sourceSection.groupValue,
      targetGroupValue: targetSection.groupValue,
    })

    return {
      groupPropertyId: groupProperty.property.id,
      groupValue: serializePropertyValue(
        groupProperty.property.type,
        nextValue,
      ),
      rowId: draggedRowId,
      rowIds,
    }
  }

  const applyRowMove = (move: TimelineRowMove) => {
    if (!databaseId) return

    if (move.groupPropertyId) {
      moveRow.mutate({
        databaseId,
        groupPropertyId: move.groupPropertyId,
        groupValue: move.groupValue,
        rowId: move.rowId,
        rowIds: move.rowIds,
      })
      return
    }

    reorderRows.mutate({ databaseId, rowIds: move.rowIds })
  }

  const clearRowDrag = () => {
    finishDatabaseRowDrag()
    setDraggedRowId(null)
    setHoveredRowId(null)
    setRowDropTargetIndex(null)
    setRowDragOverlay(null)
  }

  const startRowDrag = (
    row: SortableDatabaseItem,
    event: ReactDragEvent<HTMLButtonElement>,
  ) => {
    if (!editable || !databaseId) return

    const layout = measureRows()
    const rowElement = timelineRef.current?.querySelector<HTMLElement>(
      `.database-timeline-sidebar-row[data-timeline-row-id="${row.id}"]`,
    )
    const rowRect = rowElement?.getBoundingClientRect()

    if (rowRect) {
      setRowDragOverlay({
        height: rowRect.height,
        left: rowRect.left,
        offsetX: event.clientX - rowRect.left,
        offsetY: event.clientY - rowRect.top,
        title: getTimelineRowTitle(row),
        top: rowRect.top,
        width: rowRect.width,
      })
    }

    startDatabaseRowDrag()
    hideNativeDatabaseRowDragPreview(event.dataTransfer)
    setDraggedRowId(row.id)
    const sourceIndex = visibleRowIndexById.get(row.id) ?? 0
    setRowDropTargetIndex(sourceIndex)
    setRowLayout(layout)
    event.dataTransfer.effectAllowed = "copyMove"
    event.dataTransfer.setData(
      DATABASE_PAGE_DRAG_MIME,
      JSON.stringify({ databaseId, pageId: row.pageId, rowId: row.id }),
    )
    event.dataTransfer.setData("text/plain", getTimelineRowTitle(row))
  }

  const confirmSortedRowMove = () => {
    if (!pendingSortedRowMove) return

    const move = pendingSortedRowMove
    setPendingSortedRowMove(null)
    void saveDatabaseSorts([])
      .then(() => applyRowMove(move))
      .catch(() => toast.error("Couldn't clear sort"))
  }

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
    onRowMouseEnter: setHoveredRowId,
    onToggleGroup: toggleGroupCollapsed,
    showPageIcon: showPageIconInTitle,
  }

  if (!timelineDateProperty) {
    if (timelineDateProperties.length === 0) {
      return (
        <div className="database-empty-state flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted-foreground">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-foreground">
              Timeline needs a date property
            </span>
            <span>Create one to schedule items on this timeline.</span>
          </div>
          <Select disabled>
            <SelectTrigger className="min-w-56">
              <SelectValue placeholder="No date properties available" />
            </SelectTrigger>
          </Select>
          <Button
            disabled={!editable || isAddingDatabaseProperty}
            onClick={setupTimelineDateProperty}
            size="sm"
            type="button"
          >
            <CalendarPlus />
            Set up date property
          </Button>
        </div>
      )
    }

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

  const rowDropLineTop =
    rowDropTargetIndex === null || !getRowMove()
      ? null
      : (rowLayout.dropTops[rowDropTargetIndex] ?? null)

  return (
    <>
      <div
        className="database-timeline-view min-h-0 flex-1 overflow-visible"
        data-sidebar-collapsed={sidebarCollapsed ? "true" : undefined}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget as globalThis.Node | null,
            )
          ) {
            setRowDropTargetIndex(null)
          }
        }}
        onDragOver={(event) => {
          if (!draggedRowId) return

          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = "move"
          setRowDropTargetIndex(getRowDropTargetIndex(event.clientY))
          setRowDragOverlay((overlay) =>
            overlay
              ? {
                  ...overlay,
                  left: event.clientX - overlay.offsetX,
                  top: event.clientY - overlay.offsetY,
                }
              : overlay,
          )
        }}
        onDrop={(event) => {
          if (!draggedRowId || rowDropTargetIndex === null) return

          event.preventDefault()
          event.stopPropagation()
          const move = getRowMove()

          if (move) {
            if (isSorted) setPendingSortedRowMove(move)
            else applyRowMove(move)
          }

          clearRowDrag()
        }}
        onMouseLeave={() => {
          if (!draggedRowId) setHoveredRowId(null)
        }}
        onScrollCapture={measureRows}
        ref={timelineRef}
        style={timelineBreakoutStyle}
      >
        {rowDragOverlay ? (
          <div
            aria-hidden="true"
            className="database-row-drag-overlay"
            style={{
              height: rowDragOverlay.height,
              left: rowDragOverlay.left,
              top: rowDragOverlay.top,
              width: rowDragOverlay.width,
            }}
          >
            <span className="database-row-drag-overlay-cell">
              <FileText />
              <span>{rowDragOverlay.title}</span>
            </span>
          </div>
        ) : null}
        {editable && !sidebarCollapsed ? (
          <div className="database-row-drag-rail database-timeline-row-drag-rail">
            {visibleRows.map((row) => {
              const rowCenter = rowLayout.centers[row.id]
              if (rowCenter === undefined) return null

              const visible = hoveredRowId === row.id || draggedRowId === row.id

              return (
                <div
                  className="database-row-controls"
                  data-visible={visible ? "true" : undefined}
                  key={row.id}
                  onMouseEnter={() => setHoveredRowId(row.id)}
                  onMouseLeave={() => {
                    if (!draggedRowId) setHoveredRowId(null)
                  }}
                  style={{ top: rowCenter }}
                >
                  <button
                    aria-label={`Drag ${getTimelineRowTitle(row)}`}
                    className="database-row-drag-handle"
                    data-database-row-drag-handle
                    data-dragging={draggedRowId === row.id ? "true" : undefined}
                    draggable
                    onClick={(event) => event.preventDefault()}
                    onDragEnd={clearRowDrag}
                    onDragStart={(event) => startRowDrag(row, event)}
                    title="Drag page"
                    type="button"
                  >
                    <GripVertical />
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}
        {rowDropLineTop !== null ? (
          <div
            className="database-row-drop-line database-timeline-row-drop-line"
            style={{ top: rowDropLineTop }}
          />
        ) : null}
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
        </GanttProvider>
      </div>
      <AlertDialog
        open={pendingSortedRowMove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSortedRowMove(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear sorting to reorder?</AlertDialogTitle>
            <AlertDialogDescription>
              Row order is manual. To save this move, Notelab needs to clear the
              active sorting first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSortedRowMove}>
              Clear sorting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
