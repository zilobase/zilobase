import type { DragEvent as ReactDragEvent } from "react"
import type { Editor } from "@tiptap/react"
import {
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

import {
  hasDragType,
  readDragPayload,
  writeDragPayload,
} from "@/editor/drag-drop"
import type { BlockDropLine } from "@/editor/types"
import { getEditorInsertDropTarget } from "./block-drag-geometry"
import { setDatabaseBlockDragImage } from "./block-drag-preview"
import type { DragHandleTarget } from "./types"

export {
  getBlockCommentHandleRect,
  getBlockDragHandleRect,
  getEditorInsertDropTarget,
  resolveBlockInsertPos,
  resolveBlockDragTargetFromPoint,
} from "./block-drag-geometry"
export { getDatabaseBlockDragImagePlacement } from "./block-drag-preview"

export const EDITOR_BLOCK_DRAG_MIME =
  "application/x-notelab-editor-block-drag"

export type BlockDragPayload = {
  editorId: string
  node: unknown
  pos: number
  textContent: string
  typeName: string
}

type DragDropBridge = {
  dropPageOnDatabase: (event: DragEvent) => boolean
  getView: () => EditorView | null
  insertDraggedPage: (view: EditorView, event: DragEvent) => boolean
  isDraggingPage: (event: DragEvent) => boolean
  isOverDatabaseDrop: (event: DragEvent) => boolean
  shouldSkipDropLine: (event: DragEvent) => boolean
  surfaceRef?: { current: HTMLElement | null }
}

type PendingDropLine = {
  clientX: number
  clientY: number
  view: EditorView
}

const EDITOR_DRAGGING_CLASS = "dragging"
const sourceEditors = new Map<string, Editor>()
let activeDragPayload: BlockDragPayload | null = null

const isListItemType = (typeName?: string) =>
  typeName === "listItem" || typeName === "taskItem"

const toPayload = (
  editorId: string,
  target: DragHandleTarget,
): BlockDragPayload => ({
  editorId,
  node: target.node.toJSON(),
  pos: target.pos,
  textContent: target.node.textContent,
  typeName: target.node.type.name,
})

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

function parsePayload(dataTransfer: DataTransfer | null) {
  return (
    readDragPayload(
      dataTransfer,
      EDITOR_BLOCK_DRAG_MIME,
      isBlockDragPayload,
      activeDragPayload,
    )
  )
}

export const getDraggedEditorBlockPayload = parsePayload

function resetDragSession(view?: EditorView | null) {
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

export function armBlockDrag(editorId: string, target: DragHandleTarget) {
  activeDragPayload = toPayload(editorId, target)
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
    resetDragSession(view)
    return false
  }

  const { dataTransfer } = event
  if (!dataTransfer) {
    resetDragSession(view)
    return false
  }

  const payload = toPayload(editorId, target)
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
  resetDragSession(view)
}

function sourceNode(view: EditorView, payload: BlockDragPayload) {
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

function deleteSource(view: EditorView, payload: BlockDragPayload) {
  const node = sourceNode(view, payload)
  if (!node) return false

  view.dispatch(
    view.state.tr
      .delete(payload.pos, payload.pos + node.nodeSize)
      .scrollIntoView(),
  )
  return true
}

export function deleteDraggedEditorBlockSource(payload: BlockDragPayload) {
  const editor = sourceEditors.get(payload.editorId)
  if (!editor || !deleteSource(editor.view, payload)) return false

  resetDragSession(editor.view)
  return true
}

function canInsertNodeAt(view: EditorView, pos: number, node: ProseMirrorNode) {
  const resolvedPos = view.state.doc.resolve(pos)

  for (let depth = resolvedPos.depth; depth >= 0; depth -= 1) {
    const index = resolvedPos.index(depth)
    if (
      resolvedPos
        .node(depth)
        .canReplaceWith(index, index, node.type, node.marks)
    ) {
      return true
    }
  }

  return false
}

function dropBlock(view: EditorView, event: DragEvent, pos: number) {
  const payload = parsePayload(event.dataTransfer)
  if (!payload) return false

  let node: ProseMirrorNode
  try {
    node = view.state.schema.nodeFromJSON(payload.node)
  } catch {
    return false
  }

  if (!canInsertNodeAt(view, pos, node)) return false

  const source = sourceEditors.get(payload.editorId)
  let insertPos = pos
  let transaction = view.state.tr

  if (source?.view === view) {
    const dragged = sourceNode(view, payload)
    if (!dragged) return false

    const from = payload.pos
    const to = from + dragged.nodeSize
    if (insertPos >= from && insertPos <= to) {
      event.preventDefault()
      return true
    }

    transaction = transaction.delete(from, to)
    if (from < insertPos) insertPos -= dragged.nodeSize
  }

  try {
    view.dispatch(transaction.insert(insertPos, node).scrollIntoView())
  } catch {
    return false
  }

  view.focus()
  if (source && source.view !== view) deleteSource(source.view, payload)

  event.preventDefault()
  resetDragSession(view)
  return true
}

function flattenList(fragment: Fragment, schema: Schema) {
  const nodes: ProseMirrorNode[] = []

  fragment.forEach((node) => {
    if (!isListItemType(node.type.name)) return

    nodes.push(node)
    const nestedList = node.content.firstChild
    if (
      nestedList &&
      (nestedList.type === schema.nodes.bulletList ||
        nestedList.type === schema.nodes.orderedList)
    ) {
      flattenList(nestedList.content, schema).forEach((child) =>
        nodes.push(child),
      )
    }
  })

  return Fragment.from(nodes)
}

function enclosingListItemDepth(view: EditorView, pos: number) {
  const resolvedPos = view.state.doc.resolve(pos)
  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    if (isListItemType(resolvedPos.node(depth).type.name)) return depth
  }
  return null
}

function listTypeForSelection(view: EditorView) {
  const from = view.state.doc.resolve(view.state.selection.from)
  for (let depth = from.depth; depth > 0; depth -= 1) {
    const typeName = from.node(depth).type.name
    if (typeName === "orderedList" || typeName === "bulletList") return typeName
  }
  return "bulletList"
}

function prepareListDrop(view: EditorView, event: DragEvent) {
  view.dom.classList.remove(EDITOR_DRAGGING_CLASS)

  const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!dropPos || !(view.state.selection instanceof NodeSelection)) return false

  const dropped = view.state.selection.node
  if (!isListItemType(dropped.type.name)) return false

  const listItemDepth = enclosingListItemDepth(view, dropPos.pos)
  const resolvedDropPos = view.state.doc.resolve(dropPos.pos)
  const slice = view.state.selection.content()
  let content = slice.content

  if (listItemDepth === null || listItemDepth !== resolvedDropPos.depth) {
    content = flattenList(content, view.state.schema)
  }

  if (listItemDepth === null) {
    const listNode =
      listTypeForSelection(view) === "orderedList"
        ? view.state.schema.nodes.orderedList
        : view.state.schema.nodes.bulletList
    if (listNode) content = Fragment.from(listNode.create(null, content))
  }

  view.dragging = {
    slice: new Slice(content, slice.openStart, slice.openEnd),
    move: !event.ctrlKey,
  }
  return false
}

function hasBlockDragData(event: DragEvent) {
  return (
    hasDragType(event.dataTransfer, EDITOR_BLOCK_DRAG_MIME) ||
    activeDragPayload !== null
  )
}

function sameDropLine(
  left: BlockDropLine | null,
  right: BlockDropLine | null,
) {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.left === right.left &&
      left.right === right.right &&
      left.top === right.top)
  )
}

export function createEditorDragDrop(
  renderDropLine: (line: BlockDropLine | null) => void,
  bridge: DragDropBridge,
) {
  let currentDropLine: BlockDropLine | null = null
  let pendingDropLine: PendingDropLine | null = null
  let dropLineFrame: number | null = null

  const setDropLine = (line: BlockDropLine | null) => {
    if (sameDropLine(currentDropLine, line)) return
    currentDropLine = line
    renderDropLine(line)
  }

  const cancelDropLineFrame = () => {
    if (dropLineFrame !== null) window.cancelAnimationFrame(dropLineFrame)
    dropLineFrame = null
    pendingDropLine = null
  }

  const clearDropLine = () => {
    cancelDropLineFrame()
    setDropLine(null)
  }

  const scheduleDropLine = (view: EditorView, event: DragEvent) => {
    pendingDropLine = {
      clientX: event.clientX,
      clientY: event.clientY,
      view,
    }
    if (dropLineFrame !== null) return

    dropLineFrame = window.requestAnimationFrame(() => {
      dropLineFrame = null
      const pending = pendingDropLine
      pendingDropLine = null
      if (!pending || !pending.view.dom.isConnected) return

      const target = getEditorInsertDropTarget(pending.view, pending)
      setDropLine(target?.line ?? null)
    })
  }

  const onDragOver = (view: EditorView, event: DragEvent) => {
    const isBlockDrag = hasBlockDragData(event)
    const isPageDrag = bridge.isDraggingPage(event)
    if (!isBlockDrag && !isPageDrag) {
      clearDropLine()
      return false
    }

    const skipDropLine = bridge.shouldSkipDropLine(event)
    const overDatabaseDrop = bridge.isOverDatabaseDrop(event)
    if (skipDropLine || overDatabaseDrop) clearDropLine()
    else scheduleDropLine(view, event)

    if (overDatabaseDrop && isPageDrag) {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
      return false
    }

    if (skipDropLine) return false

    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = isBlockDrag ? "move" : "copy"
    }
    return false
  }

  const onDrop = (view: EditorView, event: DragEvent) => {
    clearDropLine()
    if (bridge.dropPageOnDatabase(event)) return true

    const payload = parsePayload(event.dataTransfer)
    if (payload && !isListItemType(payload.typeName)) {
      const target = getEditorInsertDropTarget(view, event)
      if (target && dropBlock(view, event, target.pos)) return true
    }

    if (bridge.insertDraggedPage(view, event)) return true
    return prepareListDrop(view, event)
  }

  const onLeave = (container: Node | null, event: DragEvent) => {
    if (
      container &&
      event.relatedTarget instanceof Node &&
      container.contains(event.relatedTarget)
    ) {
      return
    }
    clearDropLine()
  }

  const endDrag = (view?: EditorView | null) => {
    clearDropLine()
    resetDragSession(view)
  }

  const isInsideEditor = (view: EditorView, target: EventTarget | null) =>
    target instanceof Node && view.dom.contains(target)

  return {
    destroy: () => {
      cancelDropLineFrame()
      currentDropLine = null
    },
    handleDrop: onDrop,
    domEvents: {
      dragover: onDragOver,
      dragend: (view: EditorView) => {
        endDrag(view)
        return false
      },
      dragleave: (view: EditorView, event: DragEvent) => {
        onLeave(view.dom, event)
        return false
      },
    },
    surfaceProps: {
      onDragEnd: () => endDrag(bridge.getView()),
      onDragLeave: (event: ReactDragEvent<HTMLElement>) =>
        onLeave(bridge.surfaceRef?.current ?? null, event.nativeEvent),
      onDragOver: (event: ReactDragEvent<HTMLElement>) => {
        const view = bridge.getView()
        if (view && !isInsideEditor(view, event.target)) {
          onDragOver(view, event.nativeEvent)
        }
      },
      onDrop: (event: ReactDragEvent<HTMLElement>) => {
        const view = bridge.getView()
        if (view && !isInsideEditor(view, event.target)) {
          onDrop(view, event.nativeEvent)
        }
      },
    },
  }
}
