import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent } from "react"
import type { Editor } from "@tiptap/react"
import {
  addColumn,
  addRow,
  moveTableColumn,
  moveTableRow,
  selectedRect,
} from "@tiptap/pm/tables"
import { MoreHorizontal, MoreVertical, Plus } from "lucide-react"

type TableAxisRect = {
  index: number
  left: number
  top: number
  width: number
  height: number
}

type TableControlRect = {
  columns: TableAxisRect[]
  left: number
  rows: TableAxisRect[]
  selectedBottom: number
  selectedColumn: number
  selectedLeft: number
  selectedRight: number
  selectedRow: number
  selectedTop: number
  top: number
  width: number
  height: number
  cellSize: number
}

type TableDragState = {
  axis: "column" | "row"
  from: number
  target: number
}

type AddControlVisibility = {
  column: boolean
  row: boolean
}

type HoveredTableCell = {
  column: number
  row: number
}

type PinnedReorderHandle = {
  axis: TableDragState["axis"]
  index: number
}

const tableControlGap = 4
const tableColumnMinWidth = 180
const tableReorderHandleSize = 14

const hiddenAddControls: AddControlVisibility = {
  column: false,
  row: false,
}

function updateTableMinWidths(editor: Editor) {
  editor.view.dom.querySelectorAll("table").forEach((table) => {
    if (!(table instanceof HTMLTableElement)) {
      return
    }

    const columnCount = table.rows[0]?.cells.length ?? 0

    if (columnCount === 0) {
      table.style.removeProperty("--table-min-width")
      return
    }

    table.style.setProperty(
      "--table-min-width",
      `${columnCount * tableColumnMinWidth}px`
    )
  })
}

function findActiveTable(editor: Editor) {
  if (!editor.isActive("table")) {
    return null
  }

  const domAtSelection = editor.view.domAtPos(editor.state.selection.from).node
  const element =
    domAtSelection instanceof HTMLElement
      ? domAtSelection
      : domAtSelection.parentElement

  const table = element?.closest("table")

  if (!(table instanceof HTMLTableElement)) {
    return null
  }

  return editor.view.dom.contains(table) ? table : null
}

function getTableControlRect(editor: Editor): TableControlRect | null {
  const table = findActiveTable(editor)

  if (!table) {
    return null
  }

  const tableRect = table.getBoundingClientRect()
  const firstCell = table.querySelector("th, td")
  const firstCellRect = firstCell?.getBoundingClientRect()
  const cellSize = Math.max(10, (firstCellRect?.height ?? 40) / 4)
  const currentRect = selectedRect(editor.state)
  const firstRow = table.rows[0]
  const columns = Array.from(firstRow?.cells ?? [], (cell, index) => {
    const rect = cell.getBoundingClientRect()

    return {
      index,
      left: rect.left,
      top: tableRect.top,
      width: rect.width,
      height: tableRect.height,
    }
  })
  const rows = Array.from(table.rows, (row, index) => {
    const rect = row.getBoundingClientRect()

    return {
      index,
      left: tableRect.left,
      top: rect.top,
      width: tableRect.width,
      height: rect.height,
    }
  })

  return {
    columns,
    left: tableRect.left,
    rows,
    selectedBottom: currentRect.bottom,
    selectedColumn: Math.min(currentRect.left, Math.max(columns.length - 1, 0)),
    selectedLeft: currentRect.left,
    selectedRight: currentRect.right,
    selectedRow: Math.min(currentRect.top, Math.max(rows.length - 1, 0)),
    selectedTop: currentRect.top,
    top: tableRect.top,
    width: tableRect.width,
    height: tableRect.height,
    cellSize,
  }
}

function getAddControlVisibility(
  rect: TableControlRect,
  clientX: number,
  clientY: number
): AddControlVisibility {
  const lastRow = rect.rows[rect.rows.length - 1]
  const lastColumn = rect.columns[rect.columns.length - 1]
  const row =
    !!lastRow &&
    clientX >= rect.left &&
    clientX <= rect.left + rect.width &&
    clientY >= lastRow.top &&
    clientY <= rect.top + rect.height + tableControlGap + rect.cellSize
  const column =
    !!lastColumn &&
    clientX >= lastColumn.left &&
    clientX <= rect.left + rect.width + tableControlGap + rect.cellSize &&
    clientY >= rect.top &&
    clientY <= rect.top + rect.height

  return {
    column,
    row,
  }
}

function getHoveredTableCell(
  rect: TableControlRect,
  clientX: number,
  clientY: number,
  currentHover: HoveredTableCell | null
): HoveredTableCell | null {
  const column = rect.columns.find((segment) => {
    return clientX >= segment.left && clientX <= segment.left + segment.width
  })
  const row = rect.rows.find((segment) => {
    return clientY >= segment.top && clientY <= segment.top + segment.height
  })

  if (column && row) {
    return {
      column: column.index,
      row: row.index,
    }
  }

  if (!currentHover) {
    return null
  }

  const activeColumn = rect.columns[currentHover.column]
  const activeRow = rect.rows[currentHover.row]
  const isOverColumnHandle =
    !!activeColumn &&
    clientX >= activeColumn.left &&
    clientX <= activeColumn.left + activeColumn.width &&
    clientY >= rect.top - tableReorderHandleSize - tableControlGap &&
    clientY <= rect.top
  const isOverRowHandle =
    !!activeRow &&
    clientX >= rect.left - tableReorderHandleSize - tableControlGap &&
    clientX <= rect.left &&
    clientY >= activeRow.top &&
    clientY <= activeRow.top + activeRow.height

  return isOverColumnHandle || isOverRowHandle ? currentHover : null
}

export function TableControls({ editor }: { editor: Editor | null }) {
  const [rect, setRect] = useState<TableControlRect | null>(null)
  const [dragPreview, setDragPreview] = useState<TableDragState | null>(null)
  const [addControls, setAddControls] =
    useState<AddControlVisibility>(hiddenAddControls)
  const [hoveredCell, setHoveredCell] = useState<HoveredTableCell | null>(null)
  const [pinnedHandle, setPinnedHandle] = useState<PinnedReorderHandle | null>(
    null
  )
  const dragState = useRef<TableDragState | null>(null)

  const updateRect = useCallback(() => {
    setRect(editor ? getTableControlRect(editor) : null)
  }, [editor])

  const setDrag = (nextDrag: TableDragState | null) => {
    dragState.current = nextDrag
    setDragPreview(nextDrag)
  }

  useEffect(() => {
    if (!editor) {
      setRect(null)
      setAddControls(hiddenAddControls)
      setHoveredCell(null)
      setPinnedHandle(null)
      return
    }

    const updateOnNextFrame = () => requestAnimationFrame(updateRect)
    const handleTransaction = () => {
      updateTableMinWidths(editor)
      updateOnNextFrame()
    }

    updateTableMinWidths(editor)
    updateRect()
    editor.on("selectionUpdate", updateOnNextFrame)
    editor.on("transaction", handleTransaction)
    window.addEventListener("resize", updateRect)
    window.addEventListener("scroll", updateRect, true)

    return () => {
      editor.off("selectionUpdate", updateOnNextFrame)
      editor.off("transaction", handleTransaction)
      window.removeEventListener("resize", updateRect)
      window.removeEventListener("scroll", updateRect, true)
    }
  }, [editor, updateRect])

  useEffect(() => {
    if (!rect) {
      setAddControls(hiddenAddControls)
      setHoveredCell(null)
      setPinnedHandle(null)
      return
    }

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const nextVisibility = getAddControlVisibility(
        rect,
        event.clientX,
        event.clientY
      )

      setAddControls((currentVisibility) => {
        if (
          currentVisibility.column === nextVisibility.column &&
          currentVisibility.row === nextVisibility.row
        ) {
          return currentVisibility
        }

        return nextVisibility
      })

      setHoveredCell((currentHover) => {
        const nextHover = getHoveredTableCell(
          rect,
          event.clientX,
          event.clientY,
          currentHover
        )

        if (
          currentHover?.column === nextHover?.column &&
          currentHover?.row === nextHover?.row
        ) {
          return currentHover
        }

        if (nextHover) {
          setPinnedHandle(null)
        }

        return nextHover
      })
    }

    window.addEventListener("pointermove", handlePointerMove)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
    }
  }, [rect])

  if (!editor || !rect) {
    return null
  }

  const appendRow = () => {
    const tableRect = selectedRect(editor.state)
    const tr = addRow(editor.state.tr, tableRect, tableRect.map.height)

    editor.view.dispatch(tr.scrollIntoView())
    updateTableMinWidths(editor)
    editor.view.focus()
    updateRect()
  }

  const appendColumn = () => {
    const tableRect = selectedRect(editor.state)
    const tr = addColumn(editor.state.tr, tableRect, tableRect.map.width)

    editor.view.dispatch(tr.scrollIntoView())
    updateTableMinWidths(editor)
    editor.view.focus()
    updateRect()
  }

  const getTargetIndex = (
    axis: TableDragState["axis"],
    clientX: number,
    clientY: number
  ) => {
    const segments = axis === "column" ? rect.columns : rect.rows
    const pointerPosition = axis === "column" ? clientX : clientY

    return (
      segments.find((segment) => {
        const start = axis === "column" ? segment.left : segment.top
        const size = axis === "column" ? segment.width : segment.height

        return pointerPosition >= start && pointerPosition <= start + size
      })?.index ?? null
    )
  }

  const finishDrag = () => {
    const currentDrag = dragState.current

    setDrag(null)

    if (!currentDrag || currentDrag.from === currentDrag.target) {
      return
    }

    setPinnedHandle({
      axis: currentDrag.axis,
      index: currentDrag.target,
    })

    const command =
      currentDrag.axis === "column"
        ? moveTableColumn({
            from: currentDrag.from,
            to: currentDrag.target,
          })
        : moveTableRow({
            from: currentDrag.from,
            to: currentDrag.target,
          })

    command(editor.state, editor.view.dispatch)
    updateTableMinWidths(editor)
    editor.view.focus()
    updateRect()
  }

  const startDrag = (
    axis: TableDragState["axis"],
    from: number,
    event: PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const nextDrag = {
      axis,
      from,
      target: from,
    }

    setDrag(nextDrag)
    setPinnedHandle(null)

    const removeDocumentListeners = () => {
      window.removeEventListener("pointermove", handleDocumentPointerMove)
      window.removeEventListener("pointerup", handleDocumentPointerUp)
      window.removeEventListener("pointercancel", handleDocumentPointerCancel)
    }

    const handleDocumentPointerMove = (moveEvent: globalThis.PointerEvent) => {
      const currentDrag = dragState.current

      if (!currentDrag) {
        removeDocumentListeners()
        return
      }

      const target = getTargetIndex(
        currentDrag.axis,
        moveEvent.clientX,
        moveEvent.clientY
      )

      if (target === null || target === currentDrag.target) {
        return
      }

      setDrag({
        ...currentDrag,
        target,
      })
    }

    const handleDocumentPointerUp = () => {
      removeDocumentListeners()
      finishDrag()
    }

    const handleDocumentPointerCancel = () => {
      removeDocumentListeners()
      setDrag(null)
    }

    window.addEventListener("pointermove", handleDocumentPointerMove)
    window.addEventListener("pointerup", handleDocumentPointerUp)
    window.addEventListener("pointercancel", handleDocumentPointerCancel)
  }

  const updateDragTarget = (
    event: PointerEvent<HTMLButtonElement>
  ) => {
    const currentDrag = dragState.current

    if (!currentDrag) {
      return
    }

    event.preventDefault()

    const target = getTargetIndex(
      currentDrag.axis,
      event.clientX,
      event.clientY
    )

    if (target === null) {
      return
    }

    if (target === currentDrag.target) {
      return
    }

    setDrag({
      ...currentDrag,
      target,
    })
  }

  const activeColumn =
    dragPreview?.axis === "column"
      ? rect.columns[dragPreview.from]
      : hoveredCell
        ? rect.columns[hoveredCell.column]
        : pinnedHandle?.axis === "column"
          ? rect.columns[pinnedHandle.index]
          : null
  const activeRow =
    dragPreview?.axis === "row"
      ? rect.rows[dragPreview.from]
      : hoveredCell
        ? rect.rows[hoveredCell.row]
        : pinnedHandle?.axis === "row"
          ? rect.rows[pinnedHandle.index]
          : null
  const selectedColumns = rect.columns.slice(rect.selectedLeft, rect.selectedRight)
  const selectedRows = rect.rows.slice(rect.selectedTop, rect.selectedBottom)
  const selectionLeft = selectedColumns[0]?.left
  const selectionRight = selectedColumns[selectedColumns.length - 1]
  const selectionTop = selectedRows[0]?.top
  const selectionBottom = selectedRows[selectedRows.length - 1]
  const dragSegments =
    dragPreview?.axis === "column" ? rect.columns : rect.rows
  const dragSource = dragPreview ? dragSegments[dragPreview.from] : null
  const dragTarget = dragPreview ? dragSegments[dragPreview.target] : null
  const dropLinePosition =
    dragPreview && dragTarget
      ? dragPreview.axis === "column"
        ? dragPreview.target > dragPreview.from
          ? dragTarget.left + dragTarget.width
          : dragTarget.left
        : dragPreview.target > dragPreview.from
          ? dragTarget.top + dragTarget.height
          : dragTarget.top
      : null

  return (
    <>
      {selectionLeft !== undefined &&
      selectionRight &&
      selectionTop !== undefined &&
      selectionBottom ? (
        <>
          <div
            aria-hidden="true"
            className="table-selection-line table-selection-line-vertical"
            style={{
              height: selectionBottom.top + selectionBottom.height - selectionTop,
              left: selectionLeft,
              top: selectionTop,
            }}
          />
          <div
            aria-hidden="true"
            className="table-selection-line table-selection-line-vertical"
            style={{
              height: selectionBottom.top + selectionBottom.height - selectionTop,
              left: selectionRight.left + selectionRight.width,
              top: selectionTop,
            }}
          />
          <div
            aria-hidden="true"
            className="table-selection-line table-selection-line-horizontal"
            style={{
              left: selectionLeft,
              top: selectionTop,
              width: selectionRight.left + selectionRight.width - selectionLeft,
            }}
          />
          <div
            aria-hidden="true"
            className="table-selection-line table-selection-line-horizontal"
            style={{
              left: selectionLeft,
              top: selectionBottom.top + selectionBottom.height,
              width: selectionRight.left + selectionRight.width - selectionLeft,
            }}
          />
        </>
      ) : null}
      {dragPreview && dragSource ? (
        <div
          aria-hidden="true"
          className="table-drag-source-outline"
          style={{
            height: dragPreview.axis === "column" ? rect.height : dragSource.height,
            left: dragPreview.axis === "column" ? dragSource.left : rect.left,
            top: dragPreview.axis === "column" ? rect.top : dragSource.top,
            width: dragPreview.axis === "column" ? dragSource.width : rect.width,
          }}
        />
      ) : null}
      {dragPreview && dropLinePosition !== null ? (
        <div
          aria-hidden="true"
          className={`table-drag-drop-line table-drag-drop-line-${dragPreview.axis}`}
          style={
            dragPreview.axis === "column"
              ? {
                  height: rect.height,
                  left: dropLinePosition,
                  top: rect.top,
                }
              : {
                  left: rect.left,
                  top: dropLinePosition,
                  width: rect.width,
                }
          }
        />
      ) : null}
      {activeColumn ? (
        <button
          aria-label="Move column"
          className="table-reorder-control table-reorder-column"
          data-dragging={dragPreview?.axis === "column" ? "true" : undefined}
          onPointerDown={(event) => {
            startDrag("column", activeColumn.index, event)
          }}
          onPointerMove={updateDragTarget}
          onPointerCancel={() => {
            setDrag(null)
          }}
          onPointerUp={finishDrag}
          style={{
            height: tableReorderHandleSize,
            left: activeColumn.left,
            top: rect.top - tableReorderHandleSize - tableControlGap,
            width: activeColumn.width,
          }}
          title="Move column"
          type="button"
        >
          <MoreHorizontal />
        </button>
      ) : null}
      {activeRow ? (
        <button
          aria-label="Move row"
          className="table-reorder-control table-reorder-row"
          data-dragging={dragPreview?.axis === "row" ? "true" : undefined}
          onPointerDown={(event) => {
            startDrag("row", activeRow.index, event)
          }}
          onPointerMove={updateDragTarget}
          onPointerCancel={() => {
            setDrag(null)
          }}
          onPointerUp={finishDrag}
          style={{
            height: activeRow.height,
            left: rect.left - tableReorderHandleSize - tableControlGap,
            top: activeRow.top,
            width: tableReorderHandleSize,
          }}
          title="Move row"
          type="button"
        >
          <MoreVertical />
        </button>
      ) : null}
      {addControls.row ? (
        <button
          aria-label="Add row"
          className="table-add-control table-add-row"
          onMouseDown={(event) => {
            event.preventDefault()
            appendRow()
          }}
          style={{
            height: rect.cellSize,
            left: rect.left,
            top: rect.top + rect.height + tableControlGap,
            width: rect.width,
          }}
          title="Add row"
          type="button"
        >
          <Plus />
        </button>
      ) : null}
      {addControls.column ? (
        <button
          aria-label="Add column"
          className="table-add-control table-add-column"
          onMouseDown={(event) => {
            event.preventDefault()
            appendColumn()
          }}
          style={{
            height: rect.height,
            left: rect.left + rect.width + tableControlGap,
            top: rect.top,
            width: rect.cellSize,
          }}
          title="Add column"
          type="button"
        >
          <Plus />
        </button>
      ) : null}
    </>
  )
}
