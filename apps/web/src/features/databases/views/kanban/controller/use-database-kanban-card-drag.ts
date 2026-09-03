import {
  useCallback,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { toast } from "sonner"
import {
  useMoveDatabaseRow,
  useReorderDatabaseRows,
} from "@zilobase/features/databases"
import { useUpdatePage } from "@zilobase/features/pages"

import { serializePropertyValue } from "../../../core/database-property-values"
import { getDatabaseGroupMoveValue } from "../../../interactions/database-group-values"
import {
  getDatabasePageDragPayload,
  hasDatabasePageDragPayload,
  setDatabasePageDragPayload,
  type DatabasePageDragPayload,
} from "../../../interactions/database-page-drop"
import {
  finishDatabaseRowDrag,
  getAnchoredReorderedRowIds,
  getFilteredReorderedRowIds,
  startDatabaseRowDrag,
} from "../../../interactions/database-row-drag"
import { isInteractiveDatabaseCardTarget } from "../../../interactions/database-card-drag-target"
import {
  canMoveRowsAcrossKanbanGroups,
  type DatabasePropertyListItem,
} from "../model/database-kanban-config"
import {
  getKanbanCardDropTargetIndex,
  getKanbanExternalDropPosition,
} from "../model/database-kanban-card-drag"

type KanbanDragRow = {
  id: string
  page: { name?: string }
  pageId: string
}

type KanbanDragOption = {
  groupValue: string
  id: string
}

type DraggedKanbanCard = {
  pageId: string
  rowId: string
  sourceOptionId: string
  sourceGroupValue: string
}

type KanbanCardDropTarget = {
  optionId: string
  targetIndex: number
}

type KanbanCardMove = {
  groupPropertyId?: string
  groupValue?: unknown
  pageId?: string
  pageTitle?: string
  rowId: string
  rowIds: string[]
}

type KanbanCardDragInput<
  Row extends KanbanDragRow,
  Option extends KanbanDragOption,
> = {
  addDraggedPageRow: (
    dragPayload: DatabasePageDragPayload,
    position: number,
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null,
  ) => void | Promise<void>
  allRows: Row[]
  databaseId: string | null | undefined
  editable: boolean
  getOptionItems: (option: Option) => Row[]
  groupProperty: DatabasePropertyListItem | null
  isSorted: boolean
  options: Option[]
  propertyValuesByKey: Record<string, string | string[]>
  saveDatabaseSorts: (sorts: []) => Promise<unknown>
}

export function useDatabaseKanbanCardDrag<
  Row extends KanbanDragRow,
  Option extends KanbanDragOption,
>(input: KanbanCardDragInput<Row, Option>) {
  const dragOriginRef = useRef<EventTarget | null>(null)
  const [draggedCard, setDraggedCard] = useState<DraggedKanbanCard | null>(null)
  const [isExternalDragActive, setIsExternalDragActive] = useState(false)
  const [dropTarget, setDropTarget] = useState<KanbanCardDropTarget | null>(null)
  const [pendingSortedMove, setPendingSortedMove] =
    useState<KanbanCardMove | null>(null)
  const moveRow = useMoveDatabaseRow()
  const reorderRows = useReorderDatabaseRows()
  const updatePage = useUpdatePage()

  const clearDrag = useCallback(() => {
    dragOriginRef.current = null
    finishDatabaseRowDrag()
    setDraggedCard(null)
    setIsExternalDragActive(false)
    setDropTarget(null)
  }, [])

  const captureDragOrigin = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      dragOriginRef.current = event.target
    },
    [],
  )

  const getMove = useCallback(
    (target = dropTarget): KanbanCardMove | null => {
      if (!draggedCard || !target || !input.groupProperty) return null

      const targetOption =
        input.options.find((option) => option.id === target.optionId) ?? null
      if (!targetOption) return null

      const targetRows = input.getOptionItems(targetOption)
      if (draggedCard.sourceOptionId === targetOption.id) {
        const rowIds = getFilteredReorderedRowIds(
          input.allRows,
          targetRows,
          draggedCard.rowId,
          target.targetIndex,
        )
        return rowIds ? { rowId: draggedCard.rowId, rowIds } : null
      }

      if (!canMoveRowsAcrossKanbanGroups(input.groupProperty)) return null

      const draggedRow = input.allRows.find((row) => row.id === draggedCard.rowId)
      if (!draggedRow) return null

      const rowIds =
        getAnchoredReorderedRowIds(
          input.allRows,
          draggedCard.rowId,
          targetRows,
          target.targetIndex,
        ) ?? input.allRows.map((row) => row.id)
      const targetGroupValue = targetOption.groupValue

      if (input.groupProperty.id === "name") {
        return {
          pageId: draggedRow.pageId,
          pageTitle: targetGroupValue,
          rowId: draggedCard.rowId,
          rowIds,
        }
      }

      const property = input.groupProperty.property
      const key = `${draggedRow.pageId}:${property.id}`
      const nextValue = getDatabaseGroupMoveValue({
        currentValue: input.propertyValuesByKey[key] ?? "",
        propertyType: property.type,
        sourceGroupValue: draggedCard.sourceGroupValue,
        targetGroupValue,
      })

      return {
        groupPropertyId: property.id,
        groupValue: serializePropertyValue(property.type, nextValue),
        rowId: draggedCard.rowId,
        rowIds,
      }
    }, [draggedCard, dropTarget, input],
  )

  const applyMove = useCallback(
    (move: KanbanCardMove) => {
      const databaseId = input.databaseId
      if (!databaseId) return

      if (move.pageId && typeof move.pageTitle === "string") {
        updatePage.mutate(
          { id: move.pageId, name: move.pageTitle },
          {
            onError: () => toast.error("Couldn't rename page"),
            onSuccess: () => {
              reorderRows.mutate({
                databaseId,
                rowIds: move.rowIds,
              })
            },
          },
        )
        return
      }

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
    }, [input.databaseId, moveRow, reorderRows, updatePage],
  )

  const confirmSortedMove = useCallback(() => {
    if (!input.databaseId || !pendingSortedMove) {
      setPendingSortedMove(null)
      return
    }

    const move = pendingSortedMove
    setPendingSortedMove(null)
    void input
      .saveDatabaseSorts([])
      .then(() => applyMove(move))
      .catch(() => toast.error("Couldn't clear sort"))
  }, [applyMove, input, pendingSortedMove])

  const startDrag = useCallback(
    (row: Row, option: Option, event: ReactDragEvent<HTMLElement>) => {
      if (!input.editable || !input.databaseId || !input.groupProperty) {
        event.preventDefault()
        return
      }
      const dragOrigin = dragOriginRef.current ?? event.target
      dragOriginRef.current = null
      if (isInteractiveDatabaseCardTarget(dragOrigin)) {
        event.preventDefault()
        return
      }

      const title = row.page.name?.trim() || "Untitled"
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
        title,
      })
      setDraggedCard({
        pageId: row.pageId,
        rowId: row.id,
        sourceOptionId: option.id,
        sourceGroupValue: option.groupValue,
      })
      setDropTarget({
        optionId: option.id,
        targetIndex: Math.max(
          0,
          input.getOptionItems(option).findIndex((item) => item.id === row.id),
        ),
      })
    },
    [input],
  )

  const dragOver = useCallback(
    (option: Option, event: ReactDragEvent<HTMLElement>) => {
      const hasExternalDragPayload =
        !draggedCard && hasDatabasePageDragPayload(event.dataTransfer)
      if (
        !input.editable ||
        !input.groupProperty ||
        (!draggedCard && !hasExternalDragPayload)
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = "move"
      setIsExternalDragActive(hasExternalDragPayload)
      setDropTarget({
        optionId: option.id,
        targetIndex: getKanbanCardDropTargetIndex(
          event.currentTarget,
          event.clientY,
        ),
      })
    },
    [draggedCard, input.editable, input.groupProperty],
  )

  const drop = useCallback(
    (option: Option, event: ReactDragEvent<HTMLElement>) => {
      const nextExternalDragPayload = draggedCard
        ? null
        : getDatabasePageDragPayload(event.dataTransfer)
      if (
        !input.editable ||
        !input.databaseId ||
        !input.groupProperty ||
        (!draggedCard && !nextExternalDragPayload)
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const target = dropTarget ?? {
        optionId: option.id,
        targetIndex: getKanbanCardDropTargetIndex(
          event.currentTarget,
          event.clientY,
        ),
      }

      if (nextExternalDragPayload) {
        const targetRows = input.getOptionItems(option)
        void input.addDraggedPageRow(
          nextExternalDragPayload,
          getKanbanExternalDropPosition(
            input.allRows,
            targetRows,
            target.targetIndex,
          ),
          option.groupValue,
          input.groupProperty,
        )
        clearDrag()
        return
      }

      const move = getMove(target)

      if (input.isSorted) {
        if (move) setPendingSortedMove(move)
      } else if (move) {
        applyMove(move)
      }
      clearDrag()
    }, [
      applyMove,
      clearDrag,
      draggedCard,
      dropTarget,
      getMove,
      input,
    ],
  )

  const leave = useCallback(
    (option: Option, event: ReactDragEvent<HTMLElement>) => {
      if (
        event.currentTarget.contains(
          event.relatedTarget as globalThis.Node | null,
        )
      ) {
        return
      }

      setIsExternalDragActive(false)
      setDropTarget((current) =>
        current?.optionId === option.id ? null : current,
      )
    },
    [],
  )

  return {
    captureDragOrigin,
    clearDrag,
    confirmSortedMove,
    dragOver,
    draggedCard,
    drop,
    dropTarget,
    getMove,
    isExternalDragActive,
    leave,
    pendingSortedMove,
    setPendingSortedMove,
    startDrag,
  }
}
