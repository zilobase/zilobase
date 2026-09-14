import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { toast } from "sonner"
import { getDatabaseRowMoveAnchors, useMoveDatabaseRow, useReorderDatabaseRows } from "@zilobase/features/databases/react";
import { useUpdatePage } from "@zilobase/features/pages/react";

import { serializePropertyValue } from "../../../properties/property-values"
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
  getKanbanCardPreview,
  getKanbanDroppedRows,
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
  height: number
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
  hostDatabaseId: string | null | undefined
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
  const newGroupDrop = useRef<{ card: DraggedKanbanCard | null; payload: DatabasePageDragPayload | null } | null>(null)
  const dragFrame = useRef<number | null>(null)
  const columnMeasurements = useRef(new Map<string, { heights: number[]; gap: number; paddingTop: number }>())
  const dragOriginRef = useRef<EventTarget | null>(null)
  const [draggedCard, setDraggedCard] = useState<DraggedKanbanCard | null>(null)
  const [isExternalDragActive, setIsExternalDragActive] = useState(false)
  const [dropTarget, setDropTarget] = useState<KanbanCardDropTarget | null>(null)
  const [pendingSortedMove, setPendingSortedMove] =
    useState<KanbanCardMove | null>(null)
  const [droppedRows, setDroppedRows] = useState<Map<string, Row[]> | null>(null)
  const moveRow = useMoveDatabaseRow()
  const reorderRows = useReorderDatabaseRows()
  const updatePage = useUpdatePage()

  const clearDrag = useCallback(() => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current)
    dragFrame.current = null
    dragOriginRef.current = null
    columnMeasurements.current.clear()
    finishDatabaseRowDrag()
    setDraggedCard(null)
    setIsExternalDragActive(false)
    setDropTarget(null)
  }, [])

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearDrag()
    }
    document.addEventListener("keydown", cancel)
    return () => {
      document.removeEventListener("keydown", cancel)
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current)
      finishDatabaseRowDrag()
    }
  }, [clearDrag])

  useEffect(() => {
    newGroupDrop.current = null
  }, [input.databaseId, input.groupProperty?.id])

  const captureDragOrigin = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      dragOriginRef.current = event.target
    },
    [],
  )

  const getMove = useCallback(
    (target = dropTarget, card = draggedCard, optionOverride?: Option): KanbanCardMove | null => {
      if (!card || !target || !input.groupProperty) return null

      const targetOption = optionOverride ??
        input.options.find((option) => option.id === target.optionId) ?? null
      if (!targetOption) return null

      const targetRows = input.getOptionItems(targetOption)
      if (card.sourceOptionId === targetOption.id) {
        const rowIds = getFilteredReorderedRowIds(
          input.allRows,
          targetRows,
          card.rowId,
          target.targetIndex,
        )
        return rowIds ? { rowId: card.rowId, rowIds } : null
      }

      if (!canMoveRowsAcrossKanbanGroups(input.groupProperty)) return null

      const draggedRow = input.allRows.find((row) => row.id === card.rowId)
      if (!draggedRow) return null

      const rowIds =
        getAnchoredReorderedRowIds(
          input.allRows,
          card.rowId,
          targetRows,
          target.targetIndex,
        ) ?? input.allRows.map((row) => row.id)
      const targetGroupValue = targetOption.groupValue

      if (input.groupProperty.id === "name") {
        return {
          pageId: draggedRow.pageId,
          pageTitle: targetGroupValue,
          rowId: card.rowId,
          rowIds,
        }
      }

      const property = input.groupProperty.property
      const key = `${draggedRow.pageId}:${property.id}`
      const nextValue = getDatabaseGroupMoveValue({
        currentValue: input.propertyValuesByKey[key] ?? "",
        propertyType: property.type,
        sourceGroupValue: card.sourceGroupValue,
        targetGroupValue,
      })

      return {
        groupPropertyId: property.id,
        groupValue: serializePropertyValue(property.type, nextValue),
        rowId: card.rowId,
        rowIds,
      }
    }, [draggedCard, dropTarget, input],
  )

  const applyMove = useCallback(
    (move: KanbanCardMove, onSettled?: () => void) => {
      const databaseId = input.databaseId
      if (!databaseId) return

      if (move.pageId && typeof move.pageTitle === "string") {
        updatePage.mutate(
          { id: move.pageId, name: move.pageTitle },
          {
            onError: () => {
              toast.error("Couldn't rename page")
              onSettled?.()
            },
            onSuccess: () => {
              reorderRows.mutate({
                databaseId,
                ...(input.hostDatabaseId
                  ? { hostDatabaseId: input.hostDatabaseId }
                  : {}),
                ...getDatabaseRowMoveAnchors(move.rowIds, move.rowId),
              }, { onSettled })
            },
          },
        )
        return
      }

      if (move.groupPropertyId) {
        moveRow.mutate({
          databaseId,
          ...(input.hostDatabaseId
            ? { hostDatabaseId: input.hostDatabaseId }
            : {}),
          groupPropertyId: move.groupPropertyId,
          groupValue: move.groupValue,
          ...getDatabaseRowMoveAnchors(move.rowIds, move.rowId),
        }, { onSettled })
        return
      }

      reorderRows.mutate({
        databaseId,
        ...(input.hostDatabaseId
          ? { hostDatabaseId: input.hostDatabaseId }
          : {}),
        ...getDatabaseRowMoveAnchors(move.rowIds, move.rowId),
      }, { onSettled })
    }, [input.databaseId, input.hostDatabaseId, moveRow, reorderRows, updatePage],
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
      if (droppedRows || !input.editable || !input.databaseId || !input.groupProperty) {
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
      columnMeasurements.current.clear()
      event.currentTarget.closest(".database-kanban-board")
        ?.querySelectorAll<HTMLElement>(".database-kanban-column[data-option-id]")
        .forEach((column) => {
          const cards = column.querySelector<HTMLElement>(".database-kanban-cards")
          if (!cards) return
          const style = getComputedStyle(cards)
          columnMeasurements.current.set(column.dataset.optionId!, {
            heights: Array.from(cards.querySelectorAll<HTMLElement>(".database-kanban-card"))
              .map((card) => card.getBoundingClientRect().height),
            gap: parseFloat(style.rowGap) || 0,
            paddingTop: parseFloat(style.paddingTop) || 0,
          })
        })
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
      // Let the browser capture its native drag image before hiding the source.
      dragFrame.current = requestAnimationFrame(() => {
        dragFrame.current = null
        setDraggedCard({
          pageId: row.pageId,
          rowId: row.id,
          sourceOptionId: option.id,
          sourceGroupValue: option.groupValue,
          height: cardRect.height,
        })
        setDropTarget({
          optionId: option.id,
          targetIndex: Math.max(
            0,
            input.getOptionItems(option).findIndex((item) => item.id === row.id),
          ),
        })
      })
    },
    [droppedRows, input],
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

      if (draggedCard && draggedCard.sourceOptionId !== option.id &&
        !canMoveRowsAcrossKanbanGroups(input.groupProperty)) return

      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = "move"
      setIsExternalDragActive(hasExternalDragPayload)
      const targetIndex = getKanbanCardDropTargetIndex(event.currentTarget, event.clientY)
      setDropTarget((current) => current?.optionId === option.id && current.targetIndex === targetIndex
        ? current
        : { optionId: option.id, targetIndex })
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
      const target = (dropTarget?.optionId === option.id ? dropTarget : null) ?? {
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
      } else if (move && draggedCard) {
        const row = input.allRows.find((item) => item.id === draggedCard.rowId)
        if (row) {
          // Replace the preview with its final layout in this same render, before
          // the asynchronous cache mutation can expose the old order again.
          const nextRows = new Map<string, Row[]>()
          for (const group of input.options) {
            if (group.id !== draggedCard.sourceOptionId && group.id !== target.optionId) continue
            nextRows.set(group.id, getKanbanDroppedRows({
              rows: input.getOptionItems(group),
              draggedRow: row,
              rowIds: move.rowIds,
              isTarget: group.id === target.optionId,
            }))
          }
          setDroppedRows(nextRows)
        }
        applyMove(move, () => setDroppedRows(null))
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

  const getPreview = (option: Option) => {
    if (!draggedCard || !dropTarget) return null
    const isTarget = dropTarget.optionId === option.id
    const isSource = draggedCard.sourceOptionId === option.id
    if (!isTarget && !isSource) return null
    const measurement = columnMeasurements.current.get(option.id)
    if (!measurement) return null
    const sourceIndex = input.getOptionItems(option).findIndex((row) => row.id === draggedCard.rowId)
    return {
      ...getKanbanCardPreview({
        ...measurement,
        draggedHeight: draggedCard.height,
        sourceIndex,
        targetIndex: isTarget ? dropTarget.targetIndex : null,
      }),
      paddingTop: measurement.paddingTop,
      hiddenIndex: sourceIndex,
      height: draggedCard.height,
    }
  }

  const canDropOnNewGroup = (event: ReactDragEvent<HTMLElement>) =>
    input.editable && Boolean(input.databaseId) && !droppedRows &&
    Boolean(draggedCard || hasDatabasePageDragPayload(event.dataTransfer))

  const dropOnNewGroup = (event: ReactDragEvent<HTMLElement>) => {
    if (!canDropOnNewGroup(event)) return false
    const payload = draggedCard ? null : getDatabasePageDragPayload(event.dataTransfer)
    if (!draggedCard && !payload) return false
    event.preventDefault()
    event.stopPropagation()
    newGroupDrop.current = { card: draggedCard, payload }
    clearDrag()
    return true
  }

  const completeNewGroupDrop = async (option: Option) => {
    const pending = newGroupDrop.current
    newGroupDrop.current = null
    if (!pending || !input.editable || !input.groupProperty) return
    if (pending.payload) {
      await input.addDraggedPageRow(pending.payload, input.allRows.length, option.groupValue, input.groupProperty)
      return
    }
    const move = getMove({ optionId: option.id, targetIndex: 0 }, pending.card, option)
    if (!move) return
    if (input.isSorted) setPendingSortedMove(move)
    else applyMove(move)
  }

  return {
    canDropOnNewGroup,
    dropOnNewGroup,
    completeNewGroupDrop,
    cancelNewGroupDrop: () => { newGroupDrop.current = null },
    isDropSettling: droppedRows !== null,
    getRenderedItems: (option: Option) => droppedRows?.get(option.id) ?? input.getOptionItems(option),
    getPreview,
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
