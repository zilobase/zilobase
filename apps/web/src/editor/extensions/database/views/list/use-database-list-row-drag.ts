import { useCallback, useState, type DragEvent } from "react"
import { useReorderDatabaseRows } from "@zilobase/features/databases"

import type { SortableDatabaseItem } from "../../interactions/database-item-utils"
import {
  finishDatabaseRowDrag,
  getFilteredReorderedRowIds,
  getReorderedRowIds,
  startDatabaseRowDrag,
} from "../../interactions/database-row-drag"

type DatabaseListRowDragInput = {
  databaseId: string | null | undefined
  hasActiveFilters: boolean
  items: SortableDatabaseItem[]
  reorderEnabled: boolean
  visibleRows: SortableDatabaseItem[]
}

export function useDatabaseListRowDrag(input: DatabaseListRowDragInput) {
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const reorderRows = useReorderDatabaseRows()

  const clearDrag = useCallback(() => {
    finishDatabaseRowDrag()
    setDraggedRowId(null)
    setDropTargetIndex(null)
  }, [])

  const startDrag = useCallback(
    (event: DragEvent<HTMLButtonElement>, rowId: string) => {
      if (!input.reorderEnabled) {
        event.preventDefault()
        return
      }

      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", rowId)
      startDatabaseRowDrag()
      setDraggedRowId(rowId)
    },
    [input.reorderEnabled],
  )

  const updateDropTarget = useCallback(
    (event: DragEvent<HTMLDivElement>, rowIndex: number) => {
      if (!draggedRowId) return

      event.preventDefault()
      event.dataTransfer.dropEffect = "move"
      const rowRect = event.currentTarget.getBoundingClientRect()
      const nextIndex =
        event.clientY < rowRect.top + rowRect.height / 2
          ? rowIndex
          : rowIndex + 1

      setDropTargetIndex(nextIndex)
    },
    [draggedRowId],
  )

  const drop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!input.databaseId || !draggedRowId || dropTargetIndex === null) {
        clearDrag()
        return
      }

      event.preventDefault()
      const rowIds = input.hasActiveFilters
        ? getFilteredReorderedRowIds(
            input.items,
            input.visibleRows,
            draggedRowId,
            dropTargetIndex,
          )
        : getReorderedRowIds(
            input.items,
            draggedRowId,
            dropTargetIndex,
          )

      if (rowIds) {
        reorderRows.mutate({ databaseId: input.databaseId, rowIds })
      }

      clearDrag()
    }, [clearDrag, draggedRowId, dropTargetIndex, input, reorderRows])

  return {
    clearDrag,
    draggedRowId,
    drop,
    dropTargetIndex,
    startDrag,
    updateDropTarget,
  }
}
