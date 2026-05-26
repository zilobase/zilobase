import type { Editor } from "@tiptap/react"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

import type { DragHandleTarget } from "./types"

export const EDITOR_BLOCK_DRAG_MIME =
  "application/x-notelab-editor-block-drag"

type BlockDragPayload = {
  editorId: string
  node: unknown
  pos: number
  textContent: string
  typeName: string
}

const dragSourceEditors = new Map<string, Editor>()
let activeBlockDragPayload: BlockDragPayload | null = null

export function registerBlockDragSource(editorId: string, editor: Editor) {
  dragSourceEditors.set(editorId, editor)

  return () => {
    if (dragSourceEditors.get(editorId) === editor) {
      dragSourceEditors.delete(editorId)
    }
  }
}

export function setDraggedBlockData({
  dataTransfer,
  editorId,
  target,
}: {
  dataTransfer: DataTransfer
  editorId: string
  target: DragHandleTarget
}) {
  const payload =
    activeBlockDragPayload?.editorId === editorId
      ? activeBlockDragPayload
      : createBlockDragPayload(editorId, target)

  activeBlockDragPayload = payload
  dataTransfer.effectAllowed = "move"
  dataTransfer.setData(EDITOR_BLOCK_DRAG_MIME, JSON.stringify(payload))
}

export function beginActiveBlockDrag(editorId: string, target: DragHandleTarget) {
  activeBlockDragPayload = createBlockDragPayload(editorId, target)
}

export function clearActiveBlockDrag() {
  activeBlockDragPayload = null
}

export function hasDraggedEditorBlock(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes(
    EDITOR_BLOCK_DRAG_MIME,
  ) || Boolean(activeBlockDragPayload)
}

export function insertDraggedEditorBlock({
  editorId,
  event,
  targetView,
}: {
  editorId: string
  event: DragEvent
  targetView: EditorView
}) {
  const payload = parseDraggedBlockPayload(event.dataTransfer)

  if (!payload) {
    return false
  }

  const sourceEditor = dragSourceEditors.get(payload.editorId)
  const coords = targetView.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  })

  if (!sourceEditor || !coords) {
    return false
  }

  event.preventDefault()
  event.stopPropagation()

  let node: ProseMirrorNode

  try {
    node = targetView.state.schema.nodeFromJSON(payload.node)
  } catch {
    return false
  }

  if (payload.editorId === editorId) {
    if (!moveDraggedNodeWithinEditor(targetView, coords.pos, payload, node)) {
      return false
    }

    targetView.focus()
    clearActiveBlockDrag()

    return true
  }

  if (!insertNodeAtDropPosition(targetView, coords.pos, node)) {
    return false
  }

  deleteDraggedSourceNode(sourceEditor.view, payload)

  targetView.focus()
  clearActiveBlockDrag()

  return true
}

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

function parseDraggedBlockPayload(dataTransfer: DataTransfer | null) {
  const rawPayload = dataTransfer?.getData(EDITOR_BLOCK_DRAG_MIME)

  if (!rawPayload) {
    return activeBlockDragPayload
  }

  try {
    const payload = JSON.parse(rawPayload) as Partial<BlockDragPayload>

    if (
      typeof payload.editorId !== "string" ||
      typeof payload.pos !== "number" ||
      typeof payload.textContent !== "string" ||
      typeof payload.typeName !== "string" ||
      !payload.node
    ) {
      return null
    }

    return payload as BlockDragPayload
  } catch {
    return null
  }
}

function deleteDraggedSourceNode(view: EditorView, payload: BlockDragPayload) {
  const sourceNode = getValidatedSourceNode(view, payload)

  if (!sourceNode) {
    return false
  }

  view.dispatch(
    view.state.tr
      .delete(payload.pos, payload.pos + sourceNode.nodeSize)
      .scrollIntoView(),
  )

  return true
}

function moveDraggedNodeWithinEditor(
  view: EditorView,
  dropPos: number,
  payload: BlockDragPayload,
  node: ProseMirrorNode,
) {
  const sourceNode = getValidatedSourceNode(view, payload)

  if (!sourceNode) {
    return false
  }

  const sourceFrom = payload.pos
  const sourceTo = sourceFrom + sourceNode.nodeSize

  if (dropPos >= sourceFrom && dropPos <= sourceTo) {
    return true
  }

  const tr = view.state.tr.delete(sourceFrom, sourceTo)
  const mappedDropPos =
    dropPos > sourceTo ? dropPos - sourceNode.nodeSize : dropPos

  if (insertNodeIntoTransaction(tr, mappedDropPos, node)) {
    view.dispatch(tr.scrollIntoView())
    return true
  }

  return false
}

function getValidatedSourceNode(
  view: EditorView,
  payload: BlockDragPayload,
) {
  let expectedNode: ProseMirrorNode

  try {
    expectedNode = view.state.schema.nodeFromJSON(payload.node)
  } catch {
    return null
  }

  const sourceNode = view.state.doc.nodeAt(payload.pos)

  if (
    !sourceNode ||
    sourceNode.type.name !== payload.typeName ||
    sourceNode.textContent !== payload.textContent ||
    !sourceNode.sameMarkup(expectedNode)
  ) {
    return null
  }

  return sourceNode
}

function insertNodeAtDropPosition(
  view: EditorView,
  pos: number,
  node: ProseMirrorNode,
) {
  const tr = view.state.tr

  if (insertNodeIntoTransaction(tr, pos, node)) {
    view.dispatch(tr.scrollIntoView())
    return true
  }

  return false
}

function insertNodeIntoTransaction(
  tr: Transaction,
  pos: number,
  node: ProseMirrorNode,
) {
  const insertAt = (nextPos: number) => {
    try {
      tr.insert(nextPos, node)
      return true
    } catch {
      return false
    }
  }

  if (insertAt(pos)) {
    return true
  }

  try {
    const $pos = tr.doc.resolve(pos)
    const fallbackPos = $pos.depth > 0 ? $pos.after(1) : pos

    return insertAt(fallbackPos)
  } catch {
    return false
  }
}
