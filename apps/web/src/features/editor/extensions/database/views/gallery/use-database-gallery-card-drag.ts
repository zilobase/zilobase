import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react"
import { useReorderDatabaseRows } from "@zilobase/features/databases"

import type { SortableDatabaseItem } from "../../interactions/database-item-utils"
import {
  getDatabasePageDragPayload,
  hasDatabasePageDragPayload,
  setDatabasePageDragPayload,
  type DatabasePageDragPayload,
} from "../../interactions/database-page-drop"
import {
  finishDatabaseRowDrag,
  getAnchoredRowInsertPosition,
  getFilteredReorderedRowIds,
  startDatabaseRowDrag,
} from "../../interactions/database-row-drag"
import { isInteractiveDatabaseCardTarget } from "../../interactions/database-card-drag-target"
import type { DatabaseTableGroupSection } from "../../interactions/database-table-group-sections"
import type { DatabasePropertyListItem } from "../kanban/database-kanban-config"

type GallerySection = DatabaseTableGroupSection<SortableDatabaseItem>

type GalleryDropTarget = {
  sectionId: string | null
  targetIndex: number
}

type DatabaseGalleryCardDragInput = {
  addDraggedPageRow: (
    dragPayload: DatabasePageDragPayload,
    position: number,
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null,
  ) => void | Promise<void>
  databaseId: string | null | undefined
  editable: boolean
  groupProperty: DatabasePropertyListItem | null
  groupedSections: GallerySection[]
  items: SortableDatabaseItem[]
  visibleRows: SortableDatabaseItem[]
}

export function useDatabaseGalleryCardDrag(
  input: DatabaseGalleryCardDragInput,
) {
  const dragOriginRef = useRef<EventTarget | null>(null)
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null)
  const [isExternalDragActive, setIsExternalDragActive] = useState(false)
  const [dropTarget, setDropTarget] = useState<GalleryDropTarget | null>(null)
  const reorderRows = useReorderDatabaseRows()

  const clearDrag = useCallback(() => {
    dragOriginRef.current = null
    finishDatabaseRowDrag()
    setDraggedRowId(null)
    setIsExternalDragActive(false)
    setDropTarget(null)
  }, [])

  const captureDragOrigin = useCallback((event: PointerEvent<HTMLElement>) => {
    dragOriginRef.current = event.target
  }, [])

  const startDrag = useCallback(
    (row: SortableDatabaseItem, event: DragEvent<HTMLElement>) => {
      if (!input.editable || !input.databaseId) {
        event.preventDefault()
        return
      }

      const dragOrigin = dragOriginRef.current ?? event.target
      dragOriginRef.current = null
      if (isInteractiveDatabaseCardTarget(dragOrigin)) {
        event.preventDefault()
        return
      }

      const cardRect = event.currentTarget.getBoundingClientRect()
      event.dataTransfer.setDragImage(
        event.currentTarget,
        event.clientX - cardRect.left,
        event.clientY - cardRect.top,
      )
      event.stopPropagation()
      startDatabaseRowDrag()
      setDatabasePageDragPayload(event.dataTransfer, {
        databaseId: input.databaseId,
        pageId: row.pageId,
        rowId: row.id,
        title: row.page.name?.trim() || "Untitled",
      })
      setDraggedRowId(row.id)
    },
    [input.databaseId, input.editable],
  )

  const dragOver = useCallback(
    (
      event: DragEvent<HTMLElement>,
      sectionId: string | null,
      targetIndex: number,
    ) => {
      const hasExternalPayload =
        !draggedRowId && hasDatabasePageDragPayload(event.dataTransfer)

      if (!input.editable || (!draggedRowId && !hasExternalPayload)) return

      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = "move"
      setIsExternalDragActive(hasExternalPayload)
      setDropTarget({ sectionId, targetIndex })
    },
    [draggedRowId, input.editable],
  )

  const leave = useCallback((event: DragEvent<HTMLElement>) => {
    if (
      !event.currentTarget.contains(
        event.relatedTarget as globalThis.Node | null,
      )
    ) {
      setIsExternalDragActive(false)
      setDropTarget(null)
    }
  }, [])

  const drop = useCallback(
    (
      event: DragEvent<HTMLElement>,
      sectionId: string | null,
      fallbackTargetIndex: number,
    ) => {
      const target =
        dropTarget?.sectionId === sectionId
          ? dropTarget
          : { sectionId, targetIndex: fallbackTargetIndex }
      const section = sectionId
        ? input.groupedSections.find((candidate) => candidate.id === sectionId)
        : null
      const anchorRows = section?.rows ?? input.visibleRows
      const externalPayload = !draggedRowId
        ? getDatabasePageDragPayload(event.dataTransfer)
        : null

      if (
        input.databaseId &&
        externalPayload &&
        externalPayload.databaseId !== input.databaseId
      ) {
        event.preventDefault()
        event.stopPropagation()
        void input.addDraggedPageRow(
          externalPayload,
          getAnchoredRowInsertPosition(
            input.items,
            anchorRows,
            target.targetIndex,
          ),
          section?.groupValue,
          section ? input.groupProperty : undefined,
        )
        clearDrag()
        return
      }

      if (!input.databaseId || !draggedRowId) {
        clearDrag()
        return
      }

      const sourceSection = input.groupedSections.find((candidate) =>
        candidate.rows.some((row) => row.id === draggedRowId),
      )

      if (section?.id !== sourceSection?.id) {
        clearDrag()
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const rowIds = getFilteredReorderedRowIds(
        input.items,
        anchorRows,
        draggedRowId,
        target.targetIndex,
      )

      if (rowIds) {
        reorderRows.mutate({ databaseId: input.databaseId, rowIds })
      }
      clearDrag()
    },
    [clearDrag, draggedRowId, dropTarget, input, reorderRows],
  )

  return {
    captureDragOrigin,
    clearDrag,
    dragOver,
    draggedRowId,
    drop,
    dropTarget,
    isExternalDragActive,
    leave,
    startDrag,
  }
}
