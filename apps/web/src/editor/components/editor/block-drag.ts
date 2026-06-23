import type { Editor } from "@tiptap/react"
import {
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

import type { DragHandleTarget } from "./types"

export const EDITOR_BLOCK_DRAG_MIME =
  "application/x-notelab-editor-block-drag"

export type BlockDragPayload = {
  editorId: string
  node: unknown
  pos: number
  textContent: string
  typeName: string
}

export type BlockDragDropTarget = {
  line: {
    left: number
    right: number
    top: number
  }
  pos: number
}

const dragSourceEditors = new Map<string, Editor>()
let activeBlockDragPayload: BlockDragPayload | null = null

const blockDragSelectors = [
  "li",
  "p",
  ".code-block-shiki",
  "blockquote",
  "h1, h2, h3, h4, h5, h6",
  "[data-type=horizontalRule]",
  "table",
  ".image-block",
  ".video-block",
  ".embed-block",
  ".file-block",
  ".bookmark-block",
  ".database-block",
  ".page-block",
  ".editor-details",
].join(", ")

const parentContainerTypes = new Set([
  "blockquote",
  "details",
  "detailsContent",
  "bulletList",
  "orderedList",
  "taskList",
  "tableRow",
  "tableCell",
  "tableHeader",
  "column",
  "columnBlock",
])

const DRAG_HANDLE_WIDTH = 56
const DRAG_HANDLE_GAP = 8

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

export function resolvePlaneDragTargetFromPoint({
  clientX,
  clientY,
  currentTarget,
  view,
}: {
  clientX: number
  clientY: number
  currentTarget?: DragHandleTarget | null
  view: EditorView
}): DragHandleTarget | null {
  const editorElement = view.dom
  const root = view.root
  const elements = root.elementsFromPoint(clientX, clientY)
  const isOverDragHandle = elements.some(
    (element) =>
      element instanceof HTMLElement && Boolean(element.closest(".drag-handle"))
  )

  if (isOverDragHandle) {
    return currentTarget ?? null
  }

  const isInsideEditor = elements.some(
    (element) =>
      element instanceof HTMLElement && editorElement.contains(element)
  )

  if (!isInsideEditor) {
    return null
  }

  const domNode = nodeDOMAtCoords({ clientX, clientY })

  if (domNode) {
    const target = targetFromDOMNode(view, domNode)

    if (target) {
      return target
    }
  }

  return null
}

function getBlockPaddingInset(domNode: HTMLElement) {
  const style = window.getComputedStyle(domNode)

  return {
    left: Number.parseFloat(style.paddingLeft) || 0,
    top: Number.parseFloat(style.paddingTop) || 0,
  }
}

export function getPlaneDragHandleRect(
  view: EditorView,
  target: DragHandleTarget,
) {
  const domNode = view.nodeDOM(target.pos)

  if (!(domNode instanceof HTMLElement)) {
    return null
  }

  const nodeRect = domNode.getBoundingClientRect()
  const editorRect = view.dom.getBoundingClientRect()
  const inset = getBlockPaddingInset(domNode)
  const contentLeft = nodeRect.left + inset.left
  const contentTop = nodeRect.top + inset.top
  const railLeft = Math.max(
    editorRect.left + 4,
    contentLeft - DRAG_HANDLE_WIDTH - DRAG_HANDLE_GAP,
  )

  return {
    left: railLeft,
    top: contentTop,
  }
}

function getDragHandleAnchorRect(domNode: HTMLElement) {
  const blockquote = domNode.closest<HTMLElement>("blockquote")

  if (blockquote) {
    return blockquote.getBoundingClientRect()
  }

  const listItem = domNode.closest<HTMLElement>("li")
  const list = listItem?.parentElement?.closest<HTMLElement>("ul, ol")

  if (list && list.dataset.type !== "taskList") {
    return list.getBoundingClientRect()
  }

  return null
}

export function startPlaneBlockDrag({
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
  view.focus()

  try {
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, target.pos)))
  } catch {
    return false
  }

  if (!event.dataTransfer) {
    return false
  }

  const slice = view.state.selection.content()
  const { dom, text } = view.serializeForClipboard(slice)
  const dragImage = view.nodeDOM(target.pos)

  setDraggedBlockData({
    dataTransfer: event.dataTransfer,
    editorId,
    target,
  })
  event.dataTransfer.setData("text/html", dom.innerHTML)
  event.dataTransfer.setData("text/plain", text)
  event.dataTransfer.effectAllowed = "copyMove"

  if (dragImage instanceof Element) {
    event.dataTransfer.setDragImage(dragImage, 0, 0)
  }

  view.dragging = { slice, move: !event.ctrlKey }
  view.dom.classList.add("dragging")

  return true
}

export function preparePlaneBlockDrop(view: EditorView, event: DragEvent) {
  view.dom.classList.remove("dragging")

  const dropPos = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  })

  if (!dropPos || !(view.state.selection instanceof NodeSelection)) {
    return false
  }

  const droppedNode = view.state.selection.node

  if (droppedNode.type.name !== "listItem" && droppedNode.type.name !== "taskItem") {
    return false
  }

  const resolvedPos = view.state.doc.resolve(dropPos.pos)
  let isDroppedInsideList = false
  let dropDepth = 0

  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    const typeName = resolvedPos.node(depth).type.name

    if (typeName === "listItem" || typeName === "taskItem") {
      isDroppedInsideList = true
      dropDepth = depth
      break
    }
  }

  let slice = view.state.selection.content()
  let nextFragment = slice.content

  if (!isDroppedInsideList || dropDepth !== resolvedPos.depth) {
    nextFragment = flattenListStructure(nextFragment, view.state.schema)
  }

  if (!isDroppedInsideList) {
    const listType = getClosestListType(view)
    const listNodeType =
      listType === "orderedList"
        ? view.state.schema.nodes.orderedList
        : view.state.schema.nodes.bulletList

    if (listNodeType) {
      nextFragment = Fragment.from(listNodeType.create(null, nextFragment))
    }
  }

  slice = new Slice(nextFragment, slice.openStart, slice.openEnd)
  view.dragging = { slice, move: !event.ctrlKey }

  return false
}

export function getColumnBlockDragDropTarget(
  view: EditorView,
  event: DragEvent,
): BlockDragDropTarget | null {
  const columnElement = columnElementAtPoint(view, event.clientX, event.clientY)

  if (!columnElement) {
    return null
  }

  const columnMatch = findColumnNodeByDOM(view, columnElement)

  if (!columnMatch) {
    return null
  }

  const children: Array<{
    bottom: number
    pos: number
    top: number
  }> = []

  columnMatch.node.forEach((_child, offset) => {
    const childPos = columnMatch.pos + offset + 1
    const dom = view.nodeDOM(childPos)

    if (!(dom instanceof HTMLElement)) {
      return
    }

    const rect = dom.getBoundingClientRect()

    children.push({
      bottom: rect.bottom,
      pos: childPos,
      top: rect.top,
    })
  })

  let insertIndex = children.length

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]

    if (event.clientY < child.top + (child.bottom - child.top) / 2) {
      insertIndex = index
      break
    }
  }

  let pos = columnMatch.pos + 1 + columnMatch.node.content.size

  if (insertIndex < children.length) {
    pos = children[insertIndex].pos
  }

  const columnRect = columnElement.getBoundingClientRect()
  const columnStyle = window.getComputedStyle(columnElement)
  const paddingLeft = Number.parseFloat(columnStyle.paddingLeft) || 0
  const paddingRight = Number.parseFloat(columnStyle.paddingRight) || 0
  const paddingTop = Number.parseFloat(columnStyle.paddingTop) || 0
  let top = columnRect.top + paddingTop

  if (children.length > 0) {
    if (insertIndex === 0) {
      top = children[0].top
    } else if (insertIndex >= children.length) {
      top = children[children.length - 1].bottom
    } else {
      top = (children[insertIndex - 1].bottom + children[insertIndex].top) / 2
    }
  }

  return {
    line: {
      left: columnRect.left + paddingLeft,
      right: columnRect.right - paddingRight,
      top,
    },
    pos,
  }
}

export function getPlaneBlockDragDropTarget(
  view: EditorView,
  event: DragEvent,
): BlockDragDropTarget | null {
  const domNode = nodeDOMAtCoords({
    clientX: event.clientX,
    clientY: event.clientY,
  })

  if (!domNode) {
    return null
  }

  const target = targetFromDOMNode(view, domNode)

  if (!target) {
    return null
  }

  const targetDOM = view.nodeDOM(target.pos)

  if (!(targetDOM instanceof HTMLElement)) {
    return null
  }

  const rect = targetDOM.getBoundingClientRect()
  const anchorRect = getDragHandleAnchorRect(targetDOM) ?? rect
  const placeBefore = event.clientY < rect.top + rect.height / 2

  return {
    line: {
      left: anchorRect.left,
      right: anchorRect.right,
      top: placeBefore ? rect.top : rect.bottom,
    },
    pos: placeBefore ? target.pos : target.pos + target.node.nodeSize,
  }
}

export function dropDraggedEditorBlockAt(
  view: EditorView,
  event: DragEvent,
  pos: number,
) {
  const payload = parseDraggedBlockPayload(event.dataTransfer)

  if (!payload) {
    return false
  }

  let node: ProseMirrorNode

  try {
    node = view.state.schema.nodeFromJSON(payload.node)
  } catch {
    return false
  }

  if (!canInsertNodeAt(view.state.doc, pos, node)) {
    return false
  }

  const sourceEditor = dragSourceEditors.get(payload.editorId)
  let insertPos = pos
  let tr = view.state.tr

  if (sourceEditor?.view === view) {
    const sourceNode = getValidatedSourceNode(view, payload)

    if (!sourceNode) {
      return false
    }

    const sourceFrom = payload.pos
    const sourceTo = sourceFrom + sourceNode.nodeSize

    if (insertPos >= sourceFrom && insertPos <= sourceTo) {
      event.preventDefault()
      return true
    }

    tr = tr.delete(sourceFrom, sourceTo)

    if (sourceFrom < insertPos) {
      insertPos -= sourceNode.nodeSize
    }
  }

  view.dispatch(tr.insert(insertPos, node).scrollIntoView())
  view.focus()

  if (sourceEditor && sourceEditor.view !== view) {
    deleteDraggedSourceNode(sourceEditor.view, payload)
  }

  event.preventDefault()
  clearActiveBlockDrag()

  return true
}

export function getDraggedEditorBlockPayload(dataTransfer: DataTransfer | null) {
  return parseDraggedBlockPayload(dataTransfer)
}

export function deleteDraggedEditorBlockSource(payload: BlockDragPayload) {
  const sourceEditor = dragSourceEditors.get(payload.editorId)

  if (!sourceEditor) {
    return false
  }

  const deleted = deleteDraggedSourceNode(sourceEditor.view, payload)

  if (deleted) {
    clearActiveBlockDrag()
  }

  return deleted
}

export function endPlaneBlockDrag(view?: EditorView) {
  view?.dom.classList.remove("dragging")
  clearActiveBlockDrag()
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

function nodeDOMAtCoords({
  clientX,
  clientY,
}: {
  clientX: number
  clientY: number
}) {
  const elements = document.elementsFromPoint(clientX, clientY)

  for (const element of elements) {
    if (!(element instanceof HTMLElement)) {
      continue
    }

    if (element.matches("table")) {
      return element
    }

    if (element.closest("table") && !element.matches("table")) {
      continue
    }

    if (element.matches(blockDragSelectors)) {
      return element
    }
  }

  return null
}

function columnElementAtPoint(
  view: EditorView,
  clientX: number,
  clientY: number,
) {
  const elements = view.root.elementsFromPoint(clientX, clientY)

  for (const element of elements) {
    if (!(element instanceof HTMLElement)) {
      continue
    }

    const columnElement = element.closest<HTMLElement>(".column[data-type='column']")

    if (columnElement && view.dom.contains(columnElement)) {
      return columnElement
    }
  }

  return null
}

function findColumnNodeByDOM(view: EditorView, columnElement: HTMLElement) {
  let match: { node: ProseMirrorNode; pos: number } | null = null

  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "column") {
      return
    }

    if (view.nodeDOM(pos) === columnElement) {
      match = { node, pos }
      return false
    }
  })

  return match as { node: ProseMirrorNode; pos: number } | null
}

function canInsertNodeAt(
  doc: ProseMirrorNode,
  pos: number,
  node: ProseMirrorNode,
) {
  const $pos = doc.resolve(pos)

  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const index = $pos.index(depth)

    if ($pos.node(depth).canReplaceWith(index, index, node.type, node.marks)) {
      return true
    }
  }

  return false
}

function targetFromDOMNode(view: EditorView, domNode: HTMLElement) {
  const rect = domNode.getBoundingClientRect()
  const coords = view.posAtCoords({
    left: rect.left + 50,
    top: rect.top + 1,
  })

  if (!coords || coords.inside < 0) {
    return null
  }

  if (domNode.matches("table")) {
    const tablePos = Math.max(0, coords.inside - 2)
    const tableNode = view.state.doc.nodeAt(tablePos)

    if (tableNode) {
      return { node: tableNode, pos: tablePos }
    }
  }

  if (domNode.matches("blockquote")) {
    const blockquoteCoords = view.posAtCoords({
      left: rect.left + 1,
      top: rect.top + 1,
    })

    if (blockquoteCoords && blockquoteCoords.inside >= 0) {
      return targetFromResolvedPosition(view, blockquoteCoords.inside)
    }
  }

  return targetFromResolvedPosition(view, coords.inside)
}

function targetFromResolvedPosition(view: EditorView, pos: number) {
  const $pos = view.state.doc.resolve(Math.max(0, Math.min(pos, view.state.doc.content.size)))

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    const parent = depth > 0 ? $pos.node(depth - 1) : null
    const index = depth > 0 ? $pos.index(depth - 1) : 0

    if (node.isInline || node.isText) {
      continue
    }

    if (parentContainerTypes.has(node.type.name)) {
      continue
    }

    if (
      index === 0 &&
      (parent?.type.name === "taskItem" || parent?.type.name === "listItem")
    ) {
      continue
    }

    const nodePos = $pos.before(depth)

    return { node, pos: nodePos }
  }

  const topNode = view.state.doc.nodeAt(pos)

  if (!topNode) {
    return null
  }

  if (parentContainerTypes.has(topNode.type.name)) {
    return firstDraggableDescendant(topNode, pos)
  }

  return { node: topNode, pos }
}

function firstDraggableDescendant(
  node: ProseMirrorNode,
  pos: number,
): DragHandleTarget | null {
  let target: DragHandleTarget | null = null

  node.forEach((child, offset) => {
    if (target) {
      return
    }

    const childPos = pos + offset + 1

    if (
      child.isInline ||
      child.isText ||
      parentContainerTypes.has(child.type.name)
    ) {
      if (!child.isInline && !child.isText) {
        target = firstDraggableDescendant(child, childPos)
      }

      return
    }

    target = { node: child, pos: childPos }
  })

  return target
}

function getClosestListType(view: EditorView) {
  const { from } = view.state.selection
  const $pos = view.state.doc.resolve(from)

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const typeName = $pos.node(depth).type.name

    if (typeName === "orderedList" || typeName === "bulletList") {
      return typeName
    }
  }

  return "bulletList"
}

function flattenListStructure(fragment: Fragment, schema: Schema) {
  const result: ProseMirrorNode[] = []

  fragment.forEach((node) => {
    if (node.type !== schema.nodes.listItem && node.type !== schema.nodes.taskItem) {
      return
    }

    result.push(node)

    const firstChild = node.content.firstChild

    if (
      firstChild &&
      (firstChild.type === schema.nodes.bulletList ||
        firstChild.type === schema.nodes.orderedList)
    ) {
      flattenListStructure(firstChild.content, schema).forEach((child) => {
        result.push(child)
      })
    }
  })

  return Fragment.from(result)
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
