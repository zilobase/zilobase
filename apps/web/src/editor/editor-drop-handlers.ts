import type { EditorView } from "@tiptap/pm/view"
import {
  dropDraggedEditorBlockAt,
  getDraggedEditorBlockPayload,
  getEditorInsertDropTarget,
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
  if (!draggedBlock || isListBlock(draggedBlock.typeName)) return null
  return getEditorInsertDropTarget(view, event)
}

const resolveDatabasePageDropTarget = (
  view: EditorView,
  event: DragEvent
) => {
  if (getDropDatabaseElement(event)) return null
  return getEditorInsertDropTarget(view, event)
}

export const createEditorDropHandler = (
  dropPageOnDatabase: (event: DragEvent) => boolean,
  setBlockDropLine: (line: BlockDropLine | null) => void,
  onEmbedPage?: (pageId: string) => void | Promise<void>,
) => (view: EditorView, event: DragEvent) => {
  setBlockDropLine(null)
  if (dropPageOnDatabase(event)) return true

  const draggedBlock = getDraggedEditorBlockPayload(event.dataTransfer)
  const target = resolveBlockDropTarget(view, event, draggedBlock)

  if (target) return dropDraggedEditorBlockAt(view, event, target.pos)
  return (
    insertDraggedDatabasePage(view, event, onEmbedPage) ||
    preparePlaneBlockDrop(view, event)
  )
}

export const createEditorDragHandlers = (
  setBlockDropLine: (line: BlockDropLine | null) => void
) => ({
  dragover: (view: EditorView, event: DragEvent) => {
    const draggedBlock = getDraggedEditorBlockPayload(event.dataTransfer)
    const hasDraggedBlock = hasDraggedEditorBlock(event)
    const hasDraggedPage =
      hasDraggedDatabasePage(event) || hasDraggedPageBlock(event)
    const dropTarget = hasDraggedBlock
      ? resolveBlockDropTarget(view, event, draggedBlock)
      : hasDraggedPage
        ? resolveDatabasePageDropTarget(view, event)
        : null

    setBlockDropLine(dropTarget?.line ?? null)
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