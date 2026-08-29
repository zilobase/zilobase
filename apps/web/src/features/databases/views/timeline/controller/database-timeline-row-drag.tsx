import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type RefObject,
} from "react"
import { toast } from "sonner"
import {
  useMoveDatabaseRow,
  useReorderDatabaseRows,
} from "@zilobase/features/databases"

import type { SortableDatabaseItem } from "../../../interactions/database-item-utils"
import {
  getDatabasePageDragPayload,
  hasDatabasePageDragPayload,
  setDatabasePageDragPayload,
  type DatabasePageDragPayload,
} from "../../../interactions/database-page-drop"
import {
  finishDatabaseRowDrag,
  getAnchoredRowInsertPosition,
  hideNativeDatabaseRowDragPreview,
  startDatabaseRowDrag,
  type DatabaseRowDragOverlay,
} from "../../../interactions/database-row-drag"
import type { DatabasePropertyListItem } from "../../kanban/model/database-kanban-config"
import type { TimelineGroupSection } from "../model/database-timeline-rows"
import type { TimelineRowLayout } from "../layout/database-timeline-layout"
import {
  getTimelineRowMove,
  indexTimelineGroupSections,
  type TimelineRowMove,
} from "../model/database-timeline-row-move"

type TimelineRowDragInput = {
  addDraggedPageRow: (
    dragPayload: DatabasePageDragPayload,
    position: number,
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null,
  ) => void | Promise<void>
  databaseId: string | null | undefined
  editable: boolean
  getDropTargetIndex: (clientY: number) => number
  groupProperty: DatabasePropertyListItem | null
  groupedSections: TimelineGroupSection[]
  isFiltered: boolean
  isGrouped: boolean
  isSorted: boolean
  items: SortableDatabaseItem[]
  layout: TimelineRowLayout
  measureRows: () => TimelineRowLayout
  propertyValuesByKey: Record<string, string | string[]>
  rowsById: Map<string, SortableDatabaseItem>
  saveDatabaseSorts: (sorts: []) => Promise<unknown>
  sortedItems: SortableDatabaseItem[]
  timelineRef: RefObject<HTMLDivElement | null>
  visibleRows: SortableDatabaseItem[]
  visibleRowIndexById: Map<string, number>
}

export function useTimelineRowDrag(input: TimelineRowDragInput) {
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null)
  const [isExternalDragActive, setIsExternalDragActive] = useState(false)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [overlay, setOverlay] = useState<DatabaseRowDragOverlay | null>(null)
  const [pendingSortedMove, setPendingSortedMove] =
    useState<TimelineRowMove | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const { mutate: moveDatabaseRow } = useMoveDatabaseRow()
  const { mutate: reorderDatabaseRows } = useReorderDatabaseRows()

  const groupSectionByRowId = useMemo(
    () => indexTimelineGroupSections(input.groupedSections),
    [input.groupedSections],
  )
  const rowMove = useMemo(
    () =>
      getTimelineRowMove({
        ...input,
        draggedRowId,
        dropTargetIndex,
        groupSectionByRowId,
      }),
    [draggedRowId, dropTargetIndex, groupSectionByRowId, input],
  )

  const applyMove = useCallback(
    (move: TimelineRowMove) => {
      if (!input.databaseId) return

      if (move.groupPropertyId) {
        moveDatabaseRow({
          databaseId: input.databaseId,
          groupPropertyId: move.groupPropertyId,
          groupValue: move.groupValue,
          rowId: move.rowId,
          rowIds: move.rowIds,
        })
        return
      }

      reorderDatabaseRows({
        databaseId: input.databaseId,
        rowIds: move.rowIds,
      })
    },
    [input.databaseId, moveDatabaseRow, reorderDatabaseRows],
  )

  const clearDrag = useCallback(() => {
    finishDatabaseRowDrag()
    setDraggedRowId(null)
    setIsExternalDragActive(false)
    setHoveredRowId(null)
    setDropTargetIndex(null)
    setOverlay(null)
  }, [])

  const startDrag = useCallback(
    (
      row: SortableDatabaseItem,
      event: ReactDragEvent<HTMLButtonElement>,
    ) => {
      if (!input.editable || !input.databaseId) return

      input.measureRows()
      const rowElement = input.timelineRef.current?.querySelector<HTMLElement>(
        `.database-timeline-sidebar-row[data-timeline-row-id="${row.id}"]`,
      )
      const rowRect = rowElement?.getBoundingClientRect()

      if (rowRect) {
        setOverlay({
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
      setDropTargetIndex(input.visibleRowIndexById.get(row.id) ?? 0)
      setDatabasePageDragPayload(event.dataTransfer, {
        databaseId: input.databaseId,
        pageId: row.pageId,
        rowId: row.id,
        title: getTimelineRowTitle(row),
      })
    },
    [input],
  )

  const handleDragLeave = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (
        !event.currentTarget.contains(
          event.relatedTarget as globalThis.Node | null,
        )
      ) {
        setDropTargetIndex(null)
        setIsExternalDragActive(false)
      }
    },
    [],
  )

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const hasExternalPayload =
        !draggedRowId && hasDatabasePageDragPayload(event.dataTransfer)

      if (!input.editable || (!draggedRowId && !hasExternalPayload)) return

      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = "move"
      setIsExternalDragActive(hasExternalPayload)
      const nextTargetIndex = input.getDropTargetIndex(event.clientY)
      setDropTargetIndex((current) =>
        current === nextTargetIndex ? current : nextTargetIndex,
      )

      if (overlay && overlayRef.current) {
        overlayRef.current.style.left = `${event.clientX - overlay.offsetX}px`
        overlayRef.current.style.top = `${event.clientY - overlay.offsetY}px`
      }
    },
    [draggedRowId, input.editable, input.getDropTargetIndex, overlay],
  )

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const externalPayload = !draggedRowId
        ? getDatabasePageDragPayload(event.dataTransfer)
        : null

      if (
        input.databaseId &&
        externalPayload &&
        externalPayload.databaseId !== input.databaseId &&
        dropTargetIndex !== null
      ) {
        event.preventDefault()
        event.stopPropagation()
        const targetRow =
          input.visibleRows[
            Math.min(dropTargetIndex, input.visibleRows.length - 1)
          ]
        const targetSection = targetRow
          ? groupSectionByRowId.get(targetRow.id)
          : input.groupedSections.at(-1)
        const anchorRows = targetSection?.rows ?? input.visibleRows
        const localTargetIndex = targetSection
          ? input.visibleRows
              .slice(0, dropTargetIndex)
              .filter(
                (row) => groupSectionByRowId.get(row.id)?.id === targetSection.id,
              ).length
          : dropTargetIndex

        void input.addDraggedPageRow(
          externalPayload,
          getAnchoredRowInsertPosition(
            input.items,
            anchorRows,
            localTargetIndex,
          ),
          targetSection?.groupValue,
          targetSection ? input.groupProperty : undefined,
        )
        clearDrag()
        return
      }

      if (!draggedRowId || dropTargetIndex === null) return

      event.preventDefault()
      event.stopPropagation()
      if (rowMove) {
        if (input.isSorted) setPendingSortedMove(rowMove)
        else applyMove(rowMove)
      }
      clearDrag()
    },
    [
      applyMove,
      clearDrag,
      draggedRowId,
      dropTargetIndex,
      groupSectionByRowId,
      input,
      rowMove,
    ],
  )

  const confirmSortedMove = useCallback(() => {
    if (!pendingSortedMove) return

    const move = pendingSortedMove
    setPendingSortedMove(null)
    void input
      .saveDatabaseSorts([])
      .then(() => applyMove(move))
      .catch(() => toast.error("Couldn't clear sort"))
  }, [applyMove, input, pendingSortedMove])

  const controlRows = useMemo(() => {
    const rowIds = new Set([hoveredRowId, draggedRowId])
    const rows: SortableDatabaseItem[] = []

    for (const rowId of rowIds) {
      if (!rowId || !input.visibleRowIndexById.has(rowId)) continue
      const row = input.rowsById.get(rowId)
      if (row) rows.push(row)
    }

    return rows
  }, [draggedRowId, hoveredRowId, input.rowsById, input.visibleRowIndexById])

  const dropLineTop =
    dropTargetIndex === null || (!rowMove && !isExternalDragActive)
      ? null
      : (input.layout.dropTops[dropTargetIndex] ?? null)

  return {
    clearDrag,
    confirmSortedMove,
    controlRows,
    draggedRowId,
    dropLineTop,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    hoveredRowId,
    isExternalDragActive,
    overlay,
    overlayRef,
    pendingSortedMove,
    setHoveredRowId,
    setPendingSortedMove,
    startDrag,
  }
}

export type TimelineRowDragController = ReturnType<typeof useTimelineRowDrag>

function getTimelineRowTitle(row: SortableDatabaseItem) {
  return row.page.name.trim() || "Untitled"
}
