import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

export type ColumnAxisRect = {
  height: number
  index: number
  left: number
  top: number
  width: number
}

export type ColumnBlockRect = {
  columns: ColumnAxisRect[]
  height: number
  left: number
  node: ProseMirrorNode
  pos: number
  top: number
  width: number
}

export type ColumnDragState = {
  dropPosition?: "before" | "after"
  from: number
  target: number
}

type ColumnDragArea = Pick<ColumnBlockRect, "height" | "left" | "top" | "width">

export const columnHandleGap = 4
export const columnHandleHeight = 14

export function getColumnIndexAtPoint(
  rect: ColumnBlockRect,
  clientX: number,
  clientY: number,
) {
  const isInsideControlZone =
    clientX >= rect.left &&
    clientX <= rect.left + rect.width &&
    clientY >= rect.top - columnHandleHeight - columnHandleGap &&
    clientY <= rect.top + rect.height
  if (!isInsideControlZone) return null

  const directColumn = rect.columns.find(
    (column) =>
      clientX >= column.left && clientX <= column.left + column.width,
  )
  if (directColumn) return directColumn.index

  const closestColumn = rect.columns.reduce<ColumnAxisRect | null>(
    (closest, column) => {
      const center = column.left + column.width / 2
      const closestCenter = closest
        ? closest.left + closest.width / 2
        : Number.POSITIVE_INFINITY

      return Math.abs(clientX - center) < Math.abs(clientX - closestCenter)
        ? column
        : closest
    },
    null,
  )

  return closestColumn?.index ?? null
}

export function getColumnDragTargetIndex(
  rect: Pick<ColumnBlockRect, "columns">,
  clientX: number,
) {
  const target = rect.columns.find(
    (column) => clientX < column.left + column.width / 2,
  )
  return target?.index ?? rect.columns.length - 1
}

export function getColumnExtractionDropPosition(
  rect: ColumnDragArea,
  clientX: number,
  clientY: number,
) {
  const isInsideReorderArea =
    clientX >= rect.left &&
    clientX <= rect.left + rect.width &&
    clientY >= rect.top - columnHandleHeight - columnHandleGap &&
    clientY <= rect.top + rect.height
  if (isInsideReorderArea) return null

  return clientY < rect.top + rect.height / 2 ? "before" : "after"
}

export function reorderColumnItems<T>(items: T[], from: number, to: number) {
  const nextItems = [...items]
  const [item] = nextItems.splice(from, 1)
  if (!item) return nextItems

  nextItems.splice(to, 0, item)
  return nextItems
}
