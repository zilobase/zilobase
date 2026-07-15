import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"

import type { BlockDropLine } from "@/editor/types"
import type { DragHandleTarget } from "./types"

type BlockDropTarget = {
  line: BlockDropLine
  pos: number
}

type Point = {
  x: number
  y: number
}

type HorizontalAnchor = {
  left: number
  right: number
}

const BLOCK_SELECTOR = [
  "li",
  "p",
  ".code-block-shiki",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
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
].join(",")

const STRUCTURAL_NODE_TYPES = new Set([
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

const DATABASE_BLOCK_SELECTOR = ".database-block, .node-databaseBlock"
const DIALOG_CONTENT_SELECTOR = '[data-slot="dialog-content"]'
const BLOCK_CONTROL_SELECTOR = ".drag-handle, .block-comment-handle"
const DRAG_HANDLE_WIDTH = 64
const LIST_DRAG_HANDLE_MARKER_GAP = 16
const MIN_COORD_INSET = 4

const isListItemType = (typeName?: string) =>
  typeName === "listItem" || typeName === "taskItem"

const numberStyle = (
  element: HTMLElement,
  property: "paddingLeft" | "paddingRight" | "paddingTop",
) => Number.parseFloat(window.getComputedStyle(element)[property]) || 0

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

function dialogOffset(element: HTMLElement) {
  const dialog = element.closest(DIALOG_CONTENT_SELECTOR)
  if (!(dialog instanceof HTMLElement)) return { left: 0, top: 0 }

  const rect = dialog.getBoundingClientRect()
  return { left: rect.left, top: rect.top }
}

function dropLineAt(
  view: EditorView,
  pos: number,
  anchor?: HorizontalAnchor,
): BlockDropLine {
  const editorRect = view.dom.getBoundingClientRect()
  const offset = dialogOffset(view.dom)
  const left =
    anchor?.left ?? editorRect.left + numberStyle(view.dom, "paddingLeft")
  const right =
    anchor?.right ?? editorRect.right - numberStyle(view.dom, "paddingRight")

  return {
    left: left - offset.left,
    right: right - offset.left,
    top: view.coordsAtPos(pos).top - offset.top,
  }
}

function clampedEditorCoords(view: EditorView, point: Point) {
  const rect = view.dom.getBoundingClientRect()

  return view.posAtCoords({
    left: clamp(
      point.x,
      rect.left + MIN_COORD_INSET,
      rect.right - MIN_COORD_INSET,
    ),
    top: clamp(
      point.y,
      rect.top + MIN_COORD_INSET,
      rect.bottom - MIN_COORD_INSET,
    ),
  })
}

function elementsFromPoint(view: EditorView, point: Point) {
  return view.root.elementsFromPoint(point.x, point.y)
}

function isSelectableBlock(
  node: ProseMirrorNode,
  parent: ProseMirrorNode | null,
  indexInParent: number,
) {
  if (node.isInline || node.isText) return false
  if (STRUCTURAL_NODE_TYPES.has(node.type.name)) return false
  if (isListItemType(parent?.type.name) && indexInParent === 0) return false
  return true
}

function firstSelectableChild(
  node: ProseMirrorNode,
  pos: number,
): DragHandleTarget | null {
  let match: DragHandleTarget | null = null

  node.forEach((child, offset) => {
    if (match || child.isInline || child.isText) return

    const childPos = pos + offset + 1
    match = STRUCTURAL_NODE_TYPES.has(child.type.name)
      ? firstSelectableChild(child, childPos)
      : { node: child, pos: childPos }
  })

  return match
}

function blockFromPos(view: EditorView, pos: number): DragHandleTarget | null {
  const doc = view.state.doc
  const resolvedPos = doc.resolve(clamp(pos, 0, doc.content.size))

  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    const node = resolvedPos.node(depth)
    if (
      isSelectableBlock(
        node,
        resolvedPos.node(depth - 1),
        resolvedPos.index(depth - 1),
      )
    ) {
      return { node, pos: resolvedPos.before(depth) }
    }
  }

  const topNode = doc.nodeAt(pos)
  if (!topNode) return null
  if (isSelectableBlock(topNode, null, 0)) return { node: topNode, pos }
  return firstSelectableChild(topNode, pos)
}

function blockFromDOM(
  view: EditorView,
  element: HTMLElement,
): DragHandleTarget | null {
  const rect = element.getBoundingClientRect()
  const coords = view.posAtCoords({
    left: rect.left + Math.min(50, Math.max(1, rect.width / 2)),
    top: rect.top + 1,
  })
  if (!coords || coords.inside < 0) return null

  if (element.matches("table")) {
    const tablePos = Math.max(0, coords.inside - 2)
    const table = view.state.doc.nodeAt(tablePos)
    return table ? { node: table, pos: tablePos } : null
  }

  if (element.matches("blockquote")) {
    const inside = view.posAtCoords({
      left: rect.left + 1,
      top: rect.top + 1,
    })?.inside
    if (inside != null && inside >= 0) return blockFromPos(view, inside)
  }

  return blockFromPos(view, coords.inside)
}

function blockElementAtPoint(view: EditorView, elements: Element[]) {
  for (const element of elements) {
    if (!(element instanceof HTMLElement) || !view.dom.contains(element)) {
      continue
    }
    if (element.matches("table")) return element
    if (element.closest("table")) continue
    if (element.matches(BLOCK_SELECTOR)) return element
  }

  return null
}

function dropLineAnchor(element: HTMLElement): HorizontalAnchor | null {
  const blockquote = element.closest("blockquote")
  if (blockquote) return blockquote.getBoundingClientRect()

  const list = element.closest("li")?.parentElement?.closest<HTMLElement>("ul, ol")
  if (list && list.dataset.type !== "taskList") {
    return list.getBoundingClientRect()
  }

  return null
}

export function resolveBlockInsertPos(
  blockPos: number,
  blockSize: number,
  blockTop: number,
  blockHeight: number,
  clientY: number,
) {
  return clientY < blockTop + blockHeight / 2
    ? blockPos
    : blockPos + blockSize
}

function nodeAtDOM(
  view: EditorView,
  element: HTMLElement,
  typeName: string,
): { node: ProseMirrorNode; pos: number } | null {
  let match: { node: ProseMirrorNode; pos: number } | null = null

  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== typeName || view.nodeDOM(pos) !== element) return
    match = { node, pos }
    return false
  })

  return match
}

function columnDropTarget(view: EditorView, point: Point): BlockDropTarget | null {
  for (const element of elementsFromPoint(view, point)) {
    if (!(element instanceof HTMLElement)) continue

    const column = element.closest<HTMLElement>(".column[data-type='column']")
    if (!column || !view.dom.contains(column)) continue

    const match = nodeAtDOM(view, column, "column")
    if (!match) continue

    let insertPos = match.pos + 1 + match.node.content.size
    let found = false
    match.node.forEach((_child, offset) => {
      if (found) return

      const childPos = match.pos + offset + 1
      const childDom = view.nodeDOM(childPos)
      if (!(childDom instanceof HTMLElement)) return

      const childRect = childDom.getBoundingClientRect()
      if (point.y < (childRect.top + childRect.bottom) / 2) {
        insertPos = childPos
        found = true
      }
    })

    const rect = column.getBoundingClientRect()
    const anchor = {
      left: rect.left + numberStyle(column, "paddingLeft"),
      right: rect.right - numberStyle(column, "paddingRight"),
    }

    return { line: dropLineAt(view, insertPos, anchor), pos: insertPos }
  }

  return null
}

function blockDropTarget(view: EditorView, point: Point): BlockDropTarget | null {
  const coords = clampedEditorCoords(view, point)
  if (!coords) return null

  const target = blockFromPos(view, coords.pos)
  if (!target) {
    const endPos = view.state.doc.content.size
    return { line: dropLineAt(view, endPos), pos: endPos }
  }

  const dom = view.nodeDOM(target.pos)
  if (!(dom instanceof HTMLElement)) return null

  const rect = dom.getBoundingClientRect()
  const pos = resolveBlockInsertPos(
    target.pos,
    target.node.nodeSize,
    rect.top,
    rect.height,
    point.y,
  )

  return { line: dropLineAt(view, pos, dropLineAnchor(dom) ?? rect), pos }
}

export function getEditorInsertDropTarget(
  view: EditorView,
  event: Pick<DragEvent, "clientX" | "clientY">,
) {
  const point = { x: event.clientX, y: event.clientY }
  return columnDropTarget(view, point) ?? blockDropTarget(view, point)
}

export function resolveBlockDragTargetFromPoint({
  clientX,
  clientY,
  currentTarget,
  view,
}: {
  clientX: number
  clientY: number
  currentTarget?: DragHandleTarget | null
  view: EditorView
}) {
  const point = { x: clientX, y: clientY }
  const elements = elementsFromPoint(view, point)

  if (
    elements.some(
      (element) =>
        element instanceof HTMLElement &&
        Boolean(element.closest(BLOCK_CONTROL_SELECTOR)),
    )
  ) {
    return currentTarget ?? null
  }

  if (
    !elements.some(
      (element) => element instanceof HTMLElement && view.dom.contains(element),
    )
  ) {
    return null
  }

  const element = blockElementAtPoint(view, elements)
  return element ? blockFromDOM(view, element) : null
}

export function getBlockDragHandleRect(
  view: EditorView,
  target: DragHandleTarget,
) {
  const nodeDom = view.nodeDOM(target.pos)
  if (!(nodeDom instanceof HTMLElement)) return null

  const editorRect = view.dom.getBoundingClientRect()
  let anchor = nodeDom
  let handleOffset = DRAG_HANDLE_WIDTH
  let topInsetElement = nodeDom
  let top = nodeDom.getBoundingClientRect().top

  if (
    target.node.type.name === "listItem" &&
    nodeDom instanceof HTMLLIElement &&
    nodeDom.parentElement instanceof HTMLElement &&
    nodeDom.parentElement.matches("ul, ol") &&
    nodeDom.parentElement.dataset.type !== "taskList"
  ) {
    anchor = nodeDom.parentElement
    handleOffset += LIST_DRAG_HANDLE_MARKER_GAP
  }

  if (target.node.type.name === "databaseBlock") {
    const block = nodeDom.closest<HTMLElement>(DATABASE_BLOCK_SELECTOR) ?? nodeDom
    const toolbar = block.querySelector<HTMLElement>(".database-toolbar")
    const verticalToolbar = toolbar?.firstElementChild
    if (verticalToolbar instanceof HTMLElement) {
      top = verticalToolbar.getBoundingClientRect().top
    }

    anchor =
      block.querySelector<HTMLElement>(".database-toolbar-section") ?? block
    topInsetElement = anchor
  }

  const anchorRect = anchor.getBoundingClientRect()
  const offset = dialogOffset(view.dom)
  const left = anchorRect.left + numberStyle(anchor, "paddingLeft")

  return {
    left:
      Math.max(editorRect.left + MIN_COORD_INSET, left - handleOffset) -
      offset.left,
    top: top + numberStyle(topInsetElement, "paddingTop") - offset.top,
  }
}

export function getBlockCommentHandleRect(
  view: EditorView,
  target: DragHandleTarget,
) {
  const nodeDom = view.nodeDOM(target.pos)
  if (!(nodeDom instanceof HTMLElement)) return null

  const editorRect = view.dom.getBoundingClientRect()
  const nodeRect = nodeDom.getBoundingClientRect()
  const offset = dialogOffset(view.dom)
  const right = nodeRect.right - numberStyle(nodeDom, "paddingRight")
  const viewportRight = view.root instanceof Document
    ? view.root.documentElement.clientWidth
    : view.root.host.getBoundingClientRect().right

  return {
    left: Math.min(viewportRight - 36, Math.max(editorRect.left, right + 8)) - offset.left,
    top: nodeRect.top + numberStyle(nodeDom, "paddingTop") - offset.top,
  }
}
