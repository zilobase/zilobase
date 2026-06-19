import type { EditorView } from "@tiptap/pm/view"
import {
  dropDraggedEditorBlockAt,
  getColumnBlockDragDropTarget,
  getDraggedEditorBlockPayload,
  getPlaneBlockDragDropTarget,
  hasDraggedEditorBlock,
  preparePlaneBlockDrop,
} from "@/packages/editor/components/editor/block-drag"
import {
  getDropDatabaseElement,
  hasDraggedDatabasePage,
  hasDraggedPageBlock,
  insertDraggedDatabasePage,
} from "./database-page-drag"
import type { BlockDropLine } from "./types"

const isListBlock = (typeName?: string) =>
  typeName === "listItem" || typeName === "taskItem"

const resolveBlockDropTarget = (
  view: EditorView,
  event: DragEvent,
  draggedBlock: ReturnType<typeof getDraggedEditorBlockPayload>
) => {
  if (!draggedBlock) return null

  const columnTarget = getColumnBlockDragDropTarget(view, event)
  if (columnTarget) return columnTarget

  if (isListBlock(draggedBlock.typeName)) return null
  return getPlaneBlockDragDropTarget(view, event)
}

export const createEditorDropHandler = (
  dropPageOnDatabase: (event: DragEvent) => boolean,
  setBlockDropLine: (line: BlockDropLine | null) => void
) => (view: EditorView, event: DragEvent) => {
  setBlockDropLine(null)
  if (dropPageOnDatabase(event)) return true

  const draggedBlock = getDraggedEditorBlockPayload(event.dataTransfer)
  const target = resolveBlockDropTarget(view, event, draggedBlock)

  if (target) return dropDraggedEditorBlockAt(view, event, target.pos)
  return insertDraggedDatabasePage(view, event) || preparePlaneBlockDrop(view, event)
}

export const createEditorDragHandlers = (
  setBlockDropLine: (line: BlockDropLine | null) => void
) => ({
  dragover: (view: EditorView, event: DragEvent) => {
    const draggedBlock = getDraggedEditorBlockPayload(event.dataTransfer)
    const hasDraggedBlock = hasDraggedEditorBlock(event)
    const dropTarget = hasDraggedBlock
      ? resolveBlockDropTarget(view, event, draggedBlock)
      : null

    setBlockDropLine(dropTarget?.line ?? null)

    const hasDraggedPage =
      hasDraggedDatabasePage(event) || hasDraggedPageBlock(event)
    if (!hasDraggedBlock && !hasDraggedPage) return false

    if (getDropDatabaseElement(event) && hasDraggedPage) {
      if (event.dataTransfer) {
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
      }
      return false
    }

    if (
      event.target instanceof HTMLElement &&
      event.target.closest(".database-table-wrap")
    ) {
      return false
    }

    if (event.dataTransfer) {
      event.preventDefault()
      event.dataTransfer.dropEffect = hasDraggedBlock ? "move" : "copy"
    }
    return false
  },
  dragend: () => {
    setBlockDropLine(null)
    return false
  },
  dragleave: (view: EditorView, event: DragEvent) => {
    if (
      event.relatedTarget instanceof Node &&
      view.dom.contains(event.relatedTarget)
    ) {
      return false
    }
    setBlockDropLine(null)
    return false
  },
})