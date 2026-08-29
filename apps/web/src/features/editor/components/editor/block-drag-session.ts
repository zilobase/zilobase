import type { Editor } from "@tiptap/react"
import {
  Slice,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

import {
  hasDragType,
  readDragPayload,
  writeDragPayload,
} from "@/shared/lib/drag-drop"
import { getSelectedBlockRangesForTarget } from "../../extensions/block-selection"
import {
  setDatabaseBlockDragImage,
  setMultiBlockDragImage,
} from "./block-drag-preview"
import type { DragHandleTarget } from "./types"

export const EDITOR_BLOCK_DRAG_MIME =
  "application/x-zilobase-editor-block-drag"

export type BlockDragPayload = {
  blockCount?: number
  editorId: string
  from?: number
  node: unknown
  parentTypeName?: string
  pos: number
  slice?: unknown
  textContent: string
  to?: number
  typeName: string
}

type BlockDragSource = {
  blockCount: number
  from: number
  parentTypeName: string
  ranges: Array<{ from: number; to: number }>
  slice: Slice
  to: number
}

const EDITOR_DRAGGING_CLASS = "dragging"
const sourceEditors = new Map<string, Editor>()
let activeDragPayload: BlockDragPayload | null = null

export const isListItemType = (typeName?: string) =>
  typeName === "listItem" || typeName === "taskItem"

function createBlockDragPayload(
  editorId: string,
  target: DragHandleTarget,
  source?: BlockDragSource,
): BlockDragPayload {
  return {
    editorId,
    node: target.node.toJSON(),
    pos: target.pos,
    textContent: target.node.textContent,
    typeName: target.node.type.name,
    ...(source && source.blockCount > 1
      ? {
          blockCount: source.blockCount,
          from: source.from,
          parentTypeName: source.parentTypeName,
          slice: source.slice.toJSON(),
          to: source.to,
        }
      : {}),
  }
}

function getBlockDragSource(
  view: EditorView,
  target: DragHandleTarget,
): BlockDragSource {
  const { doc, selection } = view.state
  const selectedRanges = getSelectedBlockRangesForTarget(
    doc,
    selection.from,
    selection.to,
    target.pos,
  )
  const ranges =
    selectedRanges.length > 1
      ? selectedRanges
      : [{ from: target.pos, to: target.pos + target.node.nodeSize }]
  const from = ranges[0].from
  const to = ranges.at(-1)?.to ?? from

  return {
    blockCount: ranges.length,
    from,
    parentTypeName: doc.resolve(from).parent.type.name,
    ranges,
    slice: doc.slice(from, to),
    to,
  }
}

function isBlockDragPayload(value: unknown): value is BlockDragPayload {
  if (typeof value !== "object" || value === null) return false

  const payload = value as Record<string, unknown>
  const basePayloadIsValid =
    typeof payload.editorId === "string" &&
    typeof payload.pos === "number" &&
    typeof payload.textContent === "string" &&
    typeof payload.typeName === "string" &&
    payload.node != null

  if (!basePayloadIsValid) return false

  const hasMultiBlockFields =
    payload.blockCount !== undefined ||
    payload.from !== undefined ||
    payload.parentTypeName !== undefined ||
    payload.slice !== undefined ||
    payload.to !== undefined

  if (!hasMultiBlockFields) return true

  return (
    typeof payload.blockCount === "number" &&
    payload.blockCount > 1 &&
    typeof payload.from === "number" &&
    typeof payload.to === "number" &&
    payload.to > payload.from &&
    typeof payload.parentTypeName === "string" &&
    payload.slice != null
  )
}

export function isMultiBlockDragPayload(payload: BlockDragPayload) {
  return (
    typeof payload.blockCount === "number" &&
    payload.blockCount > 1 &&
    typeof payload.from === "number" &&
    typeof payload.to === "number" &&
    payload.slice != null
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

export function getBlockDragDatabaseId(payload: BlockDragPayload) {
  if (
    isMultiBlockDragPayload(payload) ||
    payload.typeName !== "databaseBlock" ||
    !payload.node ||
    typeof payload.node !== "object"
  ) {
    return null
  }

  const attrs = (payload.node as { attrs?: unknown }).attrs
  if (!attrs || typeof attrs !== "object") return null

  const databaseId = (attrs as { databaseId?: unknown }).databaseId
  return typeof databaseId === "string" && databaseId ? databaseId : null
}

export function canMoveDatabaseBlockToPage(
  sourceDatabaseId: string,
  currentDatabaseId: string | null | undefined,
  containingDatabaseIds: readonly string[],
) {
  return (
    sourceDatabaseId !== currentDatabaseId &&
    !containingDatabaseIds.includes(sourceDatabaseId)
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
  const sourceView = sourceEditors.get(editorId)?.view
  activeDragPayload = createBlockDragPayload(
    editorId,
    target,
    sourceView ? getBlockDragSource(sourceView, target) : undefined,
  )
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
  const source = getBlockDragSource(view, target)
  const isMultiBlockDrag = source.blockCount > 1

  view.dom.classList.add(EDITOR_DRAGGING_CLASS)
  document.getSelection()?.removeAllRanges()
  view.focus()

  if (!isMultiBlockDrag) {
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
  }

  const { dataTransfer } = event
  if (!dataTransfer) {
    resetBlockDragSession(view)
    return false
  }

  const payload = createBlockDragPayload(editorId, target, source)
  activeDragPayload = payload

  const slice = isMultiBlockDrag
    ? source.slice
    : view.state.selection.content()
  const { dom, text } = view.serializeForClipboard(slice)
  const isNodeViewBlock =
    !isMultiBlockDrag &&
    (target.node.type.name === "databaseBlock" ||
      target.node.type.name === "meetingBlock")
  const dragImageSource = view.nodeDOM(target.pos)

  dataTransfer.effectAllowed = "copyMove"
  writeDragPayload(dataTransfer, EDITOR_BLOCK_DRAG_MIME, payload)
  if (!isNodeViewBlock) dataTransfer.setData("text/html", dom.innerHTML)
  dataTransfer.setData("text/plain", text)

  if (isMultiBlockDrag) {
    setMultiBlockDragImage(
      event,
      source.ranges.flatMap((range) => {
        const domNode = view.nodeDOM(range.from)
        return domNode instanceof HTMLElement ? [domNode] : []
      }),
    )
  } else if (
    dragImageSource instanceof Element &&
    (!isNodeViewBlock || !setDatabaseBlockDragImage(event, dragImageSource))
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

export function findBlockDragSourceSlice(
  view: EditorView,
  payload: BlockDragPayload,
): { from: number; slice: Slice; to: number } | null {
  if (!isMultiBlockDragPayload(payload)) return null

  try {
    const expected = Slice.fromJSON(view.state.schema, payload.slice)
    const current = view.state.doc.slice(payload.from!, payload.to!)

    return current.eq(expected)
      ? { from: payload.from!, slice: current, to: payload.to! }
      : null
  } catch {
    return null
  }
}

export function deleteBlockDragSource(
  view: EditorView,
  payload: BlockDragPayload,
) {
  const selectedBlocks = findBlockDragSourceSlice(view, payload)
  if (selectedBlocks) {
    view.dispatch(
      view.state.tr
        .delete(selectedBlocks.from, selectedBlocks.to)
        .scrollIntoView(),
    )
    return true
  }

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
