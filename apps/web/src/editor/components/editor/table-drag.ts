import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { TableMap } from "@tiptap/pm/tables"

export type TableAxisRect = {
  height: number
  index: number
  left: number
  top: number
  width: number
}

export type TableControlRect = {
  bottom: number
  cellSize: number
  columns: TableAxisRect[]
  hasSelection: boolean
  height: number
  left: number
  map: TableMap
  right: number
  rows: TableAxisRect[]
  selectedBottom: number
  selectedColumn: number
  selectedLeft: number
  selectedRight: number
  selectedRow: number
  selectedTop: number
  table: ProseMirrorNode
  tablePos: number
  tableStart: number
  top: number
  width: number
}

export type TableDragState = {
  axis: "column" | "row"
  from: number
  target: number
}

export type AddControlVisibility = { column: boolean; row: boolean }
export type HoveredTableCell = { column: number; row: number }
export type PinnedReorderHandle = {
  axis: TableDragState["axis"]
  index: number
}

type TableDragGeometry = Pick<TableControlRect, "columns" | "rows">

export const tableControlGap = 4
export const tableReorderHandleSize = 14

export function isInsideTableControls(
  rect: TableControlRect,
  clientX: number,
  clientY: number,
) {
  return (
    clientX >= rect.left - tableReorderHandleSize - tableControlGap &&
    clientX <= rect.left + rect.width + tableControlGap + rect.cellSize &&
    clientY >= rect.top - tableReorderHandleSize - tableControlGap &&
    clientY <= rect.top + rect.height + tableControlGap + rect.cellSize
  )
}

export function getAddControlVisibility(
  rect: TableControlRect,
  clientX: number,
  clientY: number,
): AddControlVisibility {
  const lastRow = rect.rows[rect.rows.length - 1]
  const lastColumn = rect.columns[rect.columns.length - 1]

  return {
    column:
      lastColumn !== undefined &&
      clientX >= lastColumn.left &&
      clientX <= rect.left + rect.width + tableControlGap + rect.cellSize &&
      clientY >= rect.top &&
      clientY <= rect.top + rect.height,
    row:
      lastRow !== undefined &&
      clientX >= rect.left &&
      clientX <= rect.left + rect.width &&
      clientY >= lastRow.top &&
      clientY <= rect.top + rect.height + tableControlGap + rect.cellSize,
  }
}

export function getHoveredTableCell(
  rect: TableControlRect,
  clientX: number,
  clientY: number,
  currentHover: HoveredTableCell | null,
): HoveredTableCell | null {
  const column = rect.columns.find(
    (segment) =>
      clientX >= segment.left && clientX <= segment.left + segment.width,
  )
  const row = rect.rows.find(
    (segment) =>
      clientY >= segment.top && clientY <= segment.top + segment.height,
  )
  if (column && row) return { column: column.index, row: row.index }
  if (!currentHover) return null

  const activeColumn = rect.columns[currentHover.column]
  const activeRow = rect.rows[currentHover.row]
  const isOverColumnHandle =
    activeColumn !== undefined &&
    clientX >= activeColumn.left &&
    clientX <= activeColumn.left + activeColumn.width &&
    clientY >= rect.top - tableReorderHandleSize - tableControlGap &&
    clientY <= rect.top
  const isOverRowHandle =
    activeRow !== undefined &&
    clientX >= rect.left - tableReorderHandleSize - tableControlGap &&
    clientX <= rect.left &&
    clientY >= activeRow.top &&
    clientY <= activeRow.top + activeRow.height

  return isOverColumnHandle || isOverRowHandle ? currentHover : null
}

export function getTableDragTargetIndex(
  rect: TableDragGeometry,
  axis: TableDragState["axis"],
  clientX: number,
  clientY: number,
) {
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

export function getTableDropLinePosition(
  rect: TableDragGeometry,
  drag: TableDragState | null,
) {
  if (!drag) return null

  const segments = drag.axis === "column" ? rect.columns : rect.rows
  const target = segments[drag.target]
  if (!target) return null

  const start = drag.axis === "column" ? target.left : target.top
  const size = drag.axis === "column" ? target.width : target.height
  return drag.target > drag.from ? start + size : start
}
