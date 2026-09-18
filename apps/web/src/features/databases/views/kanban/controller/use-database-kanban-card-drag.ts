import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { toast } from "sonner"
import { getDatabaseRowMoveAnchors, useMoveDatabaseRow } from "@zilobase/features/databases/react";
import { useUpdatePage } from "@zilobase/features/pages/react";

import { serializePropertyValue } from "../../../schema/property-values"
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
import { markDatabaseInteractionPaint } from "../../../metrics"
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

type KanbanCardGeometry = {
  height: number
  top: number
}

type KanbanColumnMeasurement = {
  cards: KanbanCardGeometry[]
  gap: number
  heights: number[]
  paddingTop: number
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
  const hitTestFrame = useRef<number | null>(null)
  const measurementFrame = useRef<number | null>(null)
  const pendingHitTest = useRef<{ clientY: number; optionId: string } | null>(null)
  const pendingMeasurementOptionIds = useRef(new Set<string>())
  const inputRef = useRef(input)
  const columnElements = useRef(new Map<string, HTMLElement>())
  const cardElements = useRef(new Map<string, Map<string, HTMLElement>>())
  const columnMeasurements = useRef(new Map<string, KanbanColumnMeasurement>())
  const observedOptionIds = useRef(new WeakMap<Element, string>())
  const resizeObserver = useRef<ResizeObserver | null>(null)
  const columnRefCallbacks = useRef(new Map<string, (element: HTMLElement | null) => void>())
  const cardRefCallbacks = useRef(new Map<string, (element: HTMLElement | null) => void>())
  const dragOriginRef = useRef<EventTarget | null>(null)
  const [, setGeometryVersion] = useState(0)
  const [draggedCard, setDraggedCard] = useState<DraggedKanbanCard | null>(null)
  const [isExternalDragActive, setIsExternalDragActive] = useState(false)
  const [dropTarget, setDropTarget] = useState<KanbanCardDropTarget | null>(null)
  const [pendingSortedMove, setPendingSortedMove] =
    useState<KanbanCardMove | null>(null)
  const [droppedRows, setDroppedRows] = useState<Map<string, Row[]> | null>(null)
  // Mirrors `draggedCard` state synchronously: the state update is deferred to
  // a frame so the browser can capture the native drag image first, but drop
  // and drag-over handlers must see the card even on a very fast drop.
  const draggedCardRef = useRef<DraggedKanbanCard | null>(null)
  const moveRow = useMoveDatabaseRow()
  const reorderRows = useMoveDatabaseRow()
  const updatePage = useUpdatePage()
  inputRef.current = input

  const measureColumn = useCallback((optionId: string) => {
    const currentInput = inputRef.current
    const option = currentInput.options.find((candidate) => candidate.id === optionId)
    const columnElement = columnElements.current.get(optionId)
    if (!option || !columnElement) {
      columnMeasurements.current.delete(optionId)
      return
    }

    const elements = cardElements.current.get(optionId)
    const cards = currentInput.getOptionItems(option).flatMap((row) => {
      const element = elements?.get(row.id)
      if (!element) return []
      const height = element.offsetHeight || element.getBoundingClientRect().height
      return [{ height, top: element.offsetTop }]
    })
    const style = getComputedStyle(columnElement)
    const nextMeasurement = {
      cards,
      gap: parseFloat(style.rowGap) || 0,
      heights: cards.map((card) => card.height),
      paddingTop: parseFloat(style.paddingTop) || 0,
    }
    const currentMeasurement = columnMeasurements.current.get(optionId)
    if (areColumnMeasurementsEqual(currentMeasurement, nextMeasurement)) return
    columnMeasurements.current.set(optionId, nextMeasurement)
    setGeometryVersion((version) => version + 1)
  }, [])

  const scheduleColumnMeasurement = useCallback((optionId: string) => {
    pendingMeasurementOptionIds.current.add(optionId)
    if (measurementFrame.current !== null) return

    measurementFrame.current = requestAnimationFrame(() => {
      measurementFrame.current = null
      const optionIds = [...pendingMeasurementOptionIds.current]
      pendingMeasurementOptionIds.current.clear()
      optionIds.forEach(measureColumn)
    })
  }, [measureColumn])

  const getColumnRef = useCallback((optionId: string) => {
    const existing = columnRefCallbacks.current.get(optionId)
    if (existing) return existing

    const callback = (element: HTMLElement | null) => {
      const previous = columnElements.current.get(optionId)
      if (previous === element) return
      if (previous) resizeObserver.current?.unobserve(previous)
      if (element) {
        columnElements.current.set(optionId, element)
        observedOptionIds.current.set(element, optionId)
        resizeObserver.current?.observe(element)
      } else {
        columnElements.current.delete(optionId)
        columnMeasurements.current.delete(optionId)
        columnRefCallbacks.current.delete(optionId)
      }
      scheduleColumnMeasurement(optionId)
    }
    columnRefCallbacks.current.set(optionId, callback)
    return callback
  }, [scheduleColumnMeasurement])

  const getCardRef = useCallback((optionId: string, rowId: string) => {
    const key = `${optionId}\u0000${rowId}`
    const existing = cardRefCallbacks.current.get(key)
    if (existing) return existing

    const callback = (element: HTMLElement | null) => {
      let elements = cardElements.current.get(optionId)
      const previous = elements?.get(rowId)
      if (previous === element) return
      if (previous) resizeObserver.current?.unobserve(previous)
      if (element) {
        if (!elements) {
          elements = new Map()
          cardElements.current.set(optionId, elements)
        }
        elements.set(rowId, element)
        observedOptionIds.current.set(element, optionId)
        resizeObserver.current?.observe(element)
      } else {
        elements?.delete(rowId)
        if (elements?.size === 0) cardElements.current.delete(optionId)
        cardRefCallbacks.current.delete(key)
      }
      scheduleColumnMeasurement(optionId)
    }
    cardRefCallbacks.current.set(key, callback)
    return callback
  }, [scheduleColumnMeasurement])

  const getTargetIndex = useCallback((optionId: string, clientY: number) => {
    const columnElement = columnElements.current.get(optionId)
    const measurement = columnMeasurements.current.get(optionId)
    if (!columnElement || !measurement) return 0
    return getKanbanCardDropTargetIndex(
      measurement.cards,
      clientY - columnElement.getBoundingClientRect().top,
    )
  }, [])

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const optionId = observedOptionIds.current.get(entry.target)
        if (optionId) scheduleColumnMeasurement(optionId)
      })
    })
    resizeObserver.current = observer
    columnElements.current.forEach((element, optionId) => {
      observedOptionIds.current.set(element, optionId)
      observer.observe(element)
    })
    cardElements.current.forEach((elements, optionId) => {
      elements.forEach((element) => {
        observedOptionIds.current.set(element, optionId)
        observer.observe(element)
      })
    })
    return () => {
      observer.disconnect()
      resizeObserver.current = null
    }
  }, [scheduleColumnMeasurement])

  useEffect(() => {
    input.options.forEach((option) => scheduleColumnMeasurement(option.id))
  }, [input.allRows, input.options, scheduleColumnMeasurement])

  const clearDrag = useCallback(() => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current)
    if (hitTestFrame.current !== null) cancelAnimationFrame(hitTestFrame.current)
    dragFrame.current = null
    hitTestFrame.current = null
    pendingHitTest.current = null
    dragOriginRef.current = null
    draggedCardRef.current = null
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
      if (hitTestFrame.current !== null) cancelAnimationFrame(hitTestFrame.current)
      if (measurementFrame.current !== null) cancelAnimationFrame(measurementFrame.current)
      pendingMeasurementOptionIds.current.clear()
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
    (move: KanbanCardMove, onOptimisticAccepted?: () => void) => {
      const databaseId = input.databaseId
      if (!databaseId) return
      const notifyMoveError = (error: unknown) => {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : "Couldn't move card",
        )
      }

      if (move.pageId && typeof move.pageTitle === "string") {
        updatePage.mutate(
          { id: move.pageId, name: move.pageTitle },
          {
            onError: () => {
              toast.error("Couldn't rename page")
            },
            onSuccess: () => {
              reorderRows.mutate({
                databaseId,
                ...(input.hostDatabaseId
                  ? { hostDatabaseId: input.hostDatabaseId }
                  : {}),
                ...getDatabaseRowMoveAnchors(move.rowIds, move.rowId),
              }, { onError: notifyMoveError })
            },
          },
        )
        onOptimisticAccepted?.()
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
          onOptimisticAccepted,
          ...getDatabaseRowMoveAnchors(move.rowIds, move.rowId),
        }, { onError: notifyMoveError })
        return
      }

      reorderRows.mutate({
        databaseId,
        ...(input.hostDatabaseId
          ? { hostDatabaseId: input.hostDatabaseId }
          : {}),
        onOptimisticAccepted,
        ...getDatabaseRowMoveAnchors(move.rowIds, move.rowId),
      }, { onError: notifyMoveError })
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
      // The ref is set synchronously so a fast drop still sees the card even
      // if this frame hasn't run yet.
      const nextDraggedCard = {
        pageId: row.pageId,
        rowId: row.id,
        sourceOptionId: option.id,
        sourceGroupValue: option.groupValue,
        height: cardRect.height,
      }
      draggedCardRef.current = nextDraggedCard
      dragFrame.current = requestAnimationFrame(() => {
        dragFrame.current = null
        setDraggedCard(draggedCardRef.current)
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
      const activeCard = draggedCard ?? draggedCardRef.current
      const hasExternalDragPayload =
        !activeCard && hasDatabasePageDragPayload(event.dataTransfer)
      if (
        !input.editable ||
        !input.groupProperty ||
        (!activeCard && !hasExternalDragPayload)
      ) {
        return
      }

      if (activeCard && activeCard.sourceOptionId !== option.id &&
        !canMoveRowsAcrossKanbanGroups(input.groupProperty)) return

      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = "move"
      setIsExternalDragActive(hasExternalDragPayload)
      pendingHitTest.current = { clientY: event.clientY, optionId: option.id }
      if (hitTestFrame.current === null) {
        hitTestFrame.current = requestAnimationFrame(() => {
          hitTestFrame.current = null
          const pending = pendingHitTest.current
          pendingHitTest.current = null
          if (!pending) return
          const targetIndex = getTargetIndex(pending.optionId, pending.clientY)
          setDropTarget((current) => current?.optionId === pending.optionId && current.targetIndex === targetIndex
            ? current
            : { optionId: pending.optionId, targetIndex })
        })
      }
    },
    [draggedCard, getTargetIndex, input.editable, input.groupProperty],
  )

  const drop = useCallback(
    (option: Option, event: ReactDragEvent<HTMLElement>) => {
      const activeCard = draggedCard ?? draggedCardRef.current
      const nextExternalDragPayload = activeCard
        ? null
        : getDatabasePageDragPayload(event.dataTransfer)
      if (
        !input.editable ||
        !input.databaseId ||
        !input.groupProperty ||
        (!activeCard && !nextExternalDragPayload)
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      pendingHitTest.current = null
      if (hitTestFrame.current !== null) cancelAnimationFrame(hitTestFrame.current)
      hitTestFrame.current = null
      const target = {
        optionId: option.id,
        targetIndex: getTargetIndex(option.id, event.clientY),
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

      const move = getMove(target, activeCard ?? undefined)

      if (input.isSorted) {
        if (move) setPendingSortedMove(move)
      } else if (move && activeCard) {
        const dropStartedAt = performance.now()
        const row = input.allRows.find((item) => item.id === activeCard.rowId)
        if (row) {
          // Replace the preview with its final layout in this same render, before
          // the asynchronous cache mutation can expose the old order again.
          const nextRows = new Map<string, Row[]>()
          for (const group of input.options) {
            if (group.id !== activeCard.sourceOptionId && group.id !== target.optionId) continue
            nextRows.set(group.id, getKanbanDroppedRows({
              rows: input.getOptionItems(group),
              draggedRow: row,
              rowIds: move.rowIds,
              isTarget: group.id === target.optionId,
            }))
          }
          setDroppedRows(nextRows)
        }
        applyMove(move, () => {
          setDroppedRows(null)
          markDatabaseInteractionPaint(dropStartedAt)
        })
      }
      clearDrag()
    }, [
      applyMove,
      clearDrag,
      draggedCard,
      dropTarget,
      getMove,
      getTargetIndex,
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
    Boolean((draggedCard ?? draggedCardRef.current) || hasDatabasePageDragPayload(event.dataTransfer))

  const dropOnNewGroup = (event: ReactDragEvent<HTMLElement>) => {
    if (!canDropOnNewGroup(event)) return false
    const activeCard = draggedCard ?? draggedCardRef.current
    const payload = activeCard ? null : getDatabasePageDragPayload(event.dataTransfer)
    if (!activeCard && !payload) return false
    event.preventDefault()
    event.stopPropagation()
    newGroupDrop.current = { card: activeCard, payload }
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
    getCardRef,
    getColumnRef,
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

function areColumnMeasurementsEqual(
  left: KanbanColumnMeasurement | undefined,
  right: KanbanColumnMeasurement,
) {
  return Boolean(
    left &&
      left.gap === right.gap &&
      left.paddingTop === right.paddingTop &&
      left.cards.length === right.cards.length &&
      left.cards.every(
        (card, index) =>
          card.height === right.cards[index]?.height &&
          card.top === right.cards[index]?.top,
      ),
  )
}
