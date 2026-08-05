import type { Editor } from "@tiptap/react"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

import {
  hasDragType,
  readDragPayload,
  writeDragPayload,
} from "@/editor/drag-drop"
import { setDatabaseBlockDragImage } from "./block-drag-preview"
import type { DragHandleTarget } from "./types"

export const EDITOR_BLOCK_DRAG_MIME =
  "application/x-zilobase-editor-block-drag"

export type BlockDragPayload = {
  editorId: string
  node: unknown
  pos: number
  textContent: string
  typeName: string
}

const EDITOR_DRAGGING_CLASS = "dragging"
const sourceEditors = new Map<string, Editor>()
let activeDragPayload: BlockDragPayload | null = null

export const isListItemType = (typeName?: string) =>
  typeName === "listItem" || typeName === "taskItem"

function createBlockDragPayload(
  editorId: string,
  target: DragHandleTarget,
): BlockDragPayload {
  return {
    editorId,
    node: target.node.toJSON(),
    pos: target.pos,
    textContent: target.node.textContent,
    typeName: target.node.type.name,
  }
}

function isBlockDragPayload(value: unknown): value is BlockDragPayload {
  if (typeof value !== "object" || value === null) return false

  const payload = value as Record<string, unknown>
  return (
    typeof payload.editorId === "string" &&
    typeof payload.pos === "number" &&
    typeof payload.textContent === "string" &&
    typeof payload.typeName === "string" &&
    payload.node != null
  )
}

export function getDraggedEditorBlockPayload(
  dataTransfer: DataTransfer | null,
): BlockDragPayload | null {
  return readDragPayload(
    dataTransfer,
    EDITOR_BLOCK_DRAG_MIME,
    isBlockDragPayload,
    activeDragPayload,
  )
}

export function hasEditorBlockDragData(dataTransfer: DataTransfer | null) {
  return (
    hasDragType(dataTransfer, EDITOR_BLOCK_DRAG_MIME) ||
    activeDragPayload !== null
  )
}

export function resetBlockDragSession(view?: EditorView | null) {
  view?.dom.classList.remove(EDITOR_DRAGGING_CLASS)
  activeDragPayload = null
}

export function registerBlockDragSource(editorId: string, editor: Editor) {
  sourceEditors.set(editorId, editor)

  return () => {
    if (sourceEditors.get(editorId) === editor) sourceEditors.delete(editorId)
    if (activeDragPayload?.editorId === editorId) activeDragPayload = null
  }
}

export function getBlockDragSourceEditor(editorId: string) {
  return sourceEditors.get(editorId)
}

export function armBlockDrag(editorId: string, target: DragHandleTarget) {
  activeDragPayload = createBlockDragPayload(editorId, target)
}

export function startBlockDrag({
  editorId,
  event,
  target,
  view,
}: {
  editorId: string
  event: DragEvent
  target: DragHandleTarget
  view: EditorView
}) {
  view.dom.classList.add(EDITOR_DRAGGING_CLASS)
  document.getSelection()?.removeAllRanges()
  view.focus()

  try {
    view.dispatch(
      view.state.tr.setSelection(
        NodeSelection.create(view.state.doc, target.pos),
      ),
    )
  } catch {
    resetBlockDragSession(view)
    return false
  }

  const { dataTransfer } = event
  if (!dataTransfer) {
    resetBlockDragSession(view)
    return false
  }

  const payload = createBlockDragPayload(editorId, target)
  activeDragPayload = payload

  const slice = view.state.selection.content()
  const { dom, text } = view.serializeForClipboard(slice)
  const isDatabaseBlock = target.node.type.name === "databaseBlock"
  const dragImageSource = view.nodeDOM(target.pos)

  dataTransfer.effectAllowed = "copyMove"
  writeDragPayload(dataTransfer, EDITOR_BLOCK_DRAG_MIME, payload)
  if (!isDatabaseBlock) dataTransfer.setData("text/html", dom.innerHTML)
  dataTransfer.setData("text/plain", text)

  if (
    dragImageSource instanceof Element &&
    (!isDatabaseBlock || !setDatabaseBlockDragImage(event, dragImageSource))
  ) {
    dataTransfer.setDragImage(dragImageSource, 0, 0)
  }

  view.dragging = { slice, move: !event.ctrlKey }
  return true
}

export function endBlockDrag(view?: EditorView) {
  resetBlockDragSession(view)
}

export function findBlockDragSourceNode(
  view: EditorView,
  payload: BlockDragPayload,
): ProseMirrorNode | null {
  try {
    const expected = view.state.schema.nodeFromJSON(payload.node)
    const current = view.state.doc.nodeAt(payload.pos)

    if (
      current &&
      current.type.name === payload.typeName &&
      current.textContent === payload.textContent &&
      current.sameMarkup(expected)
    ) {
      return current
    }
  } catch {
    return null
  }

  return null
}

export function deleteBlockDragSource(
  view: EditorView,
  payload: BlockDragPayload,
) {
  const node = findBlockDragSourceNode(view, payload)
  if (!node) return false

  view.dispatch(
    view.state.tr
      .delete(payload.pos, payload.pos + node.nodeSize)
      .scrollIntoView(),
  )
  return true
}

export function deleteDraggedEditorBlockSource(payload: BlockDragPayload) {
  const editor = getBlockDragSourceEditor(payload.editorId)
  if (!editor || !deleteBlockDragSource(editor.view, payload)) return false

  resetBlockDragSession(editor.view)
  return true
}
