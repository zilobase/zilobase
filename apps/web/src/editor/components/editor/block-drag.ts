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

import type { BlockDropLine } from "@/editor/types"
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

type DropTarget = { line: BlockDropLine; pos: number }

const sources = new Map<string, Editor>()
let activeDrag: BlockDragPayload | null = null

const blockSelectors =
  "li,p,.code-block-shiki,blockquote,h1,h2,h3,h4,h5,h6,[data-type=horizontalRule],table,.image-block,.video-block,.embed-block,.file-block,.bookmark-block,.database-block,.page-block,.editor-details"

const parentTypes = new Set([
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

const isList = (type?: string) => type === "listItem" || type === "taskItem"

const toPayload = (editorId: string, target: DragHandleTarget): BlockDragPayload => ({
  editorId,
  node: target.node.toJSON(),
  pos: target.pos,
  textContent: target.node.textContent,
  typeName: target.node.type.name,
})

function parsePayload(dataTransfer: DataTransfer | null) {
  try {
    const raw = dataTransfer?.getData(EDITOR_BLOCK_DRAG_MIME)
    const payload = (raw ? JSON.parse(raw) : activeDrag) as BlockDragPayload | null
    if (
      !payload ||
      typeof payload.editorId !== "string" ||
      typeof payload.pos !== "number" ||
      typeof payload.typeName !== "string" ||
      !payload.node
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export const getDraggedEditorBlockPayload = parsePayload

function clearSession(view?: EditorView) {
  view?.dom.classList.remove("dragging")
  activeDrag = null
}

function clearDragState(view: EditorView | null) {
  if (view) clearSession(view)
}

function dialogOffset(el: HTMLElement) {
  const dialog = el.closest('[data-slot="dialog-content"]')
  if (!(dialog instanceof HTMLElement)) return { left: 0, top: 0 }
  const { left, top } = dialog.getBoundingClientRect()
  return { left, top }
}

function lineAt(
  view: EditorView,
  pos: number,
  anchor?: { left: number; right: number },
): BlockDropLine {
  const editor = view.dom.getBoundingClientRect()
  const offset = dialogOffset(view.dom)
  return {
    left: (anchor?.left ?? editor.left) - offset.left,
    right: (anchor?.right ?? editor.right) - offset.left,
    top: view.coordsAtPos(pos).top - offset.top,
  }
}

function clampedCoords(view: EditorView, x: number, y: number) {
  const rect = view.dom.getBoundingClientRect()
  return view.posAtCoords({
    left: Math.min(Math.max(x, rect.left + 4), rect.right - 4),
    top: Math.min(Math.max(y, rect.top + 4), rect.bottom - 4),
  })
}

function blockFromPos(view: EditorView, pos: number): DragHandleTarget | null {
  const $pos = view.state.doc.resolve(Math.max(0, Math.min(pos, view.state.doc.content.size)))

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    const parent = depth > 0 ? $pos.node(depth - 1) : null
    if (node.isInline || node.isText || parentTypes.has(node.type.name)) continue
    if ($pos.index(depth - 1) === 0 && isList(parent?.type.name)) continue
    return { node, pos: $pos.before(depth) }
  }

  const top = view.state.doc.nodeAt(pos)
  if (!top) return null
  if (!parentTypes.has(top.type.name)) return { node: top, pos }

  let target: DragHandleTarget | null = null
  top.forEach((child, offset) => {
    if (target) return
    const childPos = pos + offset + 1
    if (child.isInline || child.isText || parentTypes.has(child.type.name)) {
      if (!child.isInline && !child.isText) target = blockFromPos(view, childPos)
      return
    }
    target = { node: child, pos: childPos }
  })
  return target
}

function blockFromDOM(view: EditorView, dom: HTMLElement): DragHandleTarget | null {
  const rect = dom.getBoundingClientRect()
  const coords = view.posAtCoords({ left: rect.left + 50, top: rect.top + 1 })
  if (!coords || coords.inside < 0) return null

  if (dom.matches("table")) {
    const tablePos = Math.max(0, coords.inside - 2)
    const table = view.state.doc.nodeAt(tablePos)
    if (table) return { node: table, pos: tablePos }
  }

  if (dom.matches("blockquote")) {
    const inside = view.posAtCoords({ left: rect.left + 1, top: rect.top + 1 })?.inside
    if (inside != null && inside >= 0) return blockFromPos(view, inside)
  }

  return blockFromPos(view, coords.inside)
}

function blockAtPoint(view: EditorView, x: number, y: number) {
  for (const el of view.root.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue
    if (el.matches("table")) return el
    if (el.closest("table") && !el.matches("table")) continue
    if (el.matches(blockSelectors)) return el
  }
  return null
}

function dropAnchor(dom: HTMLElement) {
  const blockquote = dom.closest("blockquote")
  if (blockquote) return blockquote.getBoundingClientRect()
  const list = dom.closest("li")?.parentElement?.closest<HTMLElement>("ul, ol")
  if (list && list.dataset.type !== "taskList") return list.getBoundingClientRect()
  return null
}

export function resolveBlockInsertPos(
  blockPos: number,
  blockSize: number,
  blockTop: number,
  blockHeight: number,
  clientY: number,
) {
  return clientY < blockTop + blockHeight / 2 ? blockPos : blockPos + blockSize
}

function findColumn(view: EditorView, column: HTMLElement) {
  let match: { node: ProseMirrorNode; pos: number } | null = null
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "column" && view.nodeDOM(pos) === column) {
      match = { node, pos }
      return false
    }
  })
  return match as { node: ProseMirrorNode; pos: number } | null
}

function columnTarget(view: EditorView, x: number, y: number): DropTarget | null {
  for (const el of view.root.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue
    const column = el.closest<HTMLElement>(".column[data-type='column']")
    if (!column || !view.dom.contains(column)) continue

    const match = findColumn(view, column)
    if (!match) continue

    const children: Array<{ mid: number; pos: number }> = []
    match.node.forEach((_child, offset) => {
      const childPos = match.pos + offset + 1
      const dom = view.nodeDOM(childPos)
      if (!(dom instanceof HTMLElement)) return
      const rect = dom.getBoundingClientRect()
      children.push({ mid: (rect.top + rect.bottom) / 2, pos: childPos })
    })

    const hit = children.find((child) => y < child.mid)
    const pos = hit?.pos ?? match.pos + 1 + match.node.content.size
    const rect = column.getBoundingClientRect()
    const style = window.getComputedStyle(column)
    const padL = Number.parseFloat(style.paddingLeft) || 0
    const padR = Number.parseFloat(style.paddingRight) || 0

    return {
      pos,
      line: lineAt(view, pos, {
        left: rect.left + padL,
        right: rect.right - padR,
      }),
    }
  }
  return null
}

function blockTarget(view: EditorView, x: number, y: number): DropTarget | null {
  const coords = clampedCoords(view, x, y)
  if (!coords) return null

  const target = blockFromPos(view, coords.pos)
  if (!target) {
    const endPos = view.state.doc.content.size
    return { line: lineAt(view, endPos), pos: endPos }
  }

  const dom = view.nodeDOM(target.pos)
  if (!(dom instanceof HTMLElement)) return null

  const rect = dom.getBoundingClientRect()
  const pos = resolveBlockInsertPos(
    target.pos,
    target.node.nodeSize,
    rect.top,
    rect.height,
    y,
  )

  return { line: lineAt(view, pos, dropAnchor(dom) ?? rect), pos }
}

export function getEditorInsertDropTarget(view: EditorView, event: DragEvent) {
  return columnTarget(view, event.clientX, event.clientY) ?? blockTarget(view, event.clientX, event.clientY)
}

export function registerBlockDragSource(editorId: string, editor: Editor) {
  sources.set(editorId, editor)
  return () => {
    if (sources.get(editorId) === editor) sources.delete(editorId)
  }
}

export function armBlockDrag(editorId: string, target: DragHandleTarget) {
  activeDrag = toPayload(editorId, target)
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
  const elements = view.root.elementsFromPoint(clientX, clientY)
  if (elements.some((el) => el instanceof HTMLElement && el.closest(".drag-handle"))) {
    return currentTarget ?? null
  }
  if (!elements.some((el) => el instanceof HTMLElement && view.dom.contains(el))) {
    return null
  }
  const dom = blockAtPoint(view, clientX, clientY)
  return dom ? blockFromDOM(view, dom) : null
}

export function getBlockDragHandleRect(view: EditorView, target: DragHandleTarget) {
  const dom = view.nodeDOM(target.pos)
  if (!(dom instanceof HTMLElement)) return null

  const editorRect = view.dom.getBoundingClientRect()
  let anchor = dom
  let top = dom.getBoundingClientRect().top

  if (target.node.type.name === "databaseBlock") {
    const block = dom.closest<HTMLElement>(".database-block, .node-databaseBlock") ?? dom
    const toolbar = block.querySelector<HTMLElement>(".database-toolbar")
    const section = block.querySelector<HTMLElement>(".database-toolbar-section")
    const vertical = toolbar?.firstElementChild
    if (vertical instanceof HTMLElement) top = vertical.getBoundingClientRect().top
    anchor = section ?? block
  }

  const rect = anchor.getBoundingClientRect()
  const style = window.getComputedStyle(anchor)
  const left = rect.left + (Number.parseFloat(style.paddingLeft) || 0)
  const offset = dialogOffset(view.dom)

  return {
    left: Math.max(editorRect.left + 4, left - 64) - offset.left,
    top: top + (Number.parseFloat(style.paddingTop) || 0) - offset.top,
  }
}

export function getDatabaseBlockDragImagePlacement(
  pointerX: number,
  pointerY: number,
  blockLeft: number,
  blockTop: number,
) {
  return {
    offsetX: Math.max(0, pointerX - blockLeft),
    offsetY: Math.max(0, pointerY - blockTop),
    paddingLeft: Math.max(0, blockLeft - pointerX),
  }
}

function setDatabaseBlockDragImage(event: DragEvent, image: Element) {
  if (!(image instanceof HTMLElement) || !event.dataTransfer) return false

  const block = image.closest<HTMLElement>(".database-block, .node-databaseBlock") ?? image
  const rect = block.getBoundingClientRect()
  if (!rect.width || !rect.height) return false

  const placement = getDatabaseBlockDragImagePlacement(
    event.clientX,
    event.clientY,
    rect.left,
    rect.top,
  )
  const clone = block.cloneNode(true) as HTMLElement
  const scrollLefts = Array.from(
    block.querySelectorAll<HTMLElement>(".database-inline-scroll")
  ).map((element) => element.scrollLeft)
  const dragImage = document.createElement("div")

  dragImage.className = "tiptap-editor"
  dragImage.style.position = "fixed"
  dragImage.style.top = "-10000px"
  dragImage.style.left = "0"
  dragImage.style.width = `${rect.width + placement.paddingLeft}px`
  dragImage.style.height = `${rect.height}px`
  dragImage.style.pointerEvents = "none"
  dragImage.style.setProperty("--database-inline-scroll-offset", "0px")
  dragImage.style.setProperty("--database-inline-scroll-viewport-width", `${rect.width}px`)

  clone.style.margin = "0"
  clone.style.marginLeft = `${placement.paddingLeft}px`
  clone.style.width = `${rect.width}px`
  clone.style.maxWidth = `${rect.width}px`
  clone.style.overflow = "hidden"
  clone
    .querySelectorAll<HTMLElement>(".database-inline-scroll-wrap[data-inline-scroll='true']")
    .forEach((element) => {
      element.style.setProperty("--database-inline-scroll-offset", "0px")
      element.style.setProperty("--database-inline-scroll-viewport-width", `${rect.width}px`)
    })
  clone
    .querySelectorAll<HTMLElement>(".database-inline-scroll")
    .forEach((element) => {
      element.style.marginLeft = "0"
      element.style.width = `${rect.width}px`
      element.style.maxWidth = `${rect.width}px`
      element.style.overflow = "hidden"
    })
  clone
    .querySelectorAll<HTMLElement>(".database-inline-scroll-content")
    .forEach((element) => {
      element.style.paddingLeft = "0"
    })

  dragImage.appendChild(clone)
  document.body.appendChild(dragImage)
  clone
    .querySelectorAll<HTMLElement>(".database-inline-scroll")
    .forEach((element, index) => {
      element.scrollLeft = scrollLefts[index] ?? 0
    })
  event.dataTransfer.setDragImage(
    dragImage,
    placement.offsetX,
    placement.offsetY,
  )
  window.requestAnimationFrame(() => dragImage.remove())
  return true
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
  view.dom.classList.add("dragging")
  document.getSelection()?.removeAllRanges()
  view.focus()
  try {
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, target.pos)))
  } catch {
    clearSession(view)
    return false
  }
  if (!event.dataTransfer) {
    clearSession(view)
    return false
  }

  const payload = activeDrag ?? toPayload(editorId, target)
  activeDrag = payload
  const slice = view.state.selection.content()
  const { dom, text } = view.serializeForClipboard(slice)
  const isDatabaseBlockDrag = target.node.type.name === "databaseBlock"
  const image = view.nodeDOM(target.pos)

  event.dataTransfer.effectAllowed = "copyMove"
  event.dataTransfer.setData(EDITOR_BLOCK_DRAG_MIME, JSON.stringify(payload))
  if (!isDatabaseBlockDrag) {
    event.dataTransfer.setData("text/html", dom.innerHTML)
  }
  event.dataTransfer.setData("text/plain", text)
  if (
    image instanceof Element &&
    (!isDatabaseBlockDrag || !setDatabaseBlockDragImage(event, image))
  ) {
    event.dataTransfer.setDragImage(image, 0, 0)
  }

  view.dragging = { slice, move: !event.ctrlKey }
  return true
}

export function endBlockDrag(view?: EditorView) {
  clearSession(view)
}

function sourceNode(view: EditorView, payload: BlockDragPayload) {
  try {
    const expected = view.state.schema.nodeFromJSON(payload.node)
    const node = view.state.doc.nodeAt(payload.pos)
    if (
      node &&
      node.type.name === payload.typeName &&
      node.textContent === payload.textContent &&
      node.sameMarkup(expected)
    ) {
      return node
    }
  } catch {
    return null
  }
  return null
}

function deleteSource(view: EditorView, payload: BlockDragPayload) {
  const node = sourceNode(view, payload)
  if (!node) return false
  view.dispatch(view.state.tr.delete(payload.pos, payload.pos + node.nodeSize).scrollIntoView())
  return true
}

export function deleteDraggedEditorBlockSource(payload: BlockDragPayload) {
  const editor = sources.get(payload.editorId)
  if (!editor || !deleteSource(editor.view, payload)) return false
  clearSession(editor.view)
  return true
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

  const $pos = view.state.doc.resolve(pos)
  let canInsert = false
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const index = $pos.index(depth)
    if ($pos.node(depth).canReplaceWith(index, index, node.type, node.marks)) {
      canInsert = true
      break
    }
  }
  if (!canInsert) return false

  const source = sources.get(payload.editorId)
  let insertPos = pos
  let tr = view.state.tr

  if (source?.view === view) {
    const dragged = sourceNode(view, payload)
    if (!dragged) return false
    const from = payload.pos
    const to = from + dragged.nodeSize
    if (insertPos >= from && insertPos <= to) {
      event.preventDefault()
      return true
    }
    tr = tr.delete(from, to)
    if (from < insertPos) insertPos -= dragged.nodeSize
  }

  view.dispatch(tr.insert(insertPos, node).scrollIntoView())
  view.focus()
  if (source && source.view !== view) deleteSource(source.view, payload)

  event.preventDefault()
  clearSession(view)
  return true
}

function flattenList(fragment: Fragment, schema: Schema) {
  const result: ProseMirrorNode[] = []
  fragment.forEach((node) => {
    if (!isList(node.type.name)) return
    result.push(node)
    const list = node.content.firstChild
    if (list && (list.type === schema.nodes.bulletList || list.type === schema.nodes.orderedList)) {
      flattenList(list.content, schema).forEach((child) => result.push(child))
    }
  })
  return Fragment.from(result)
}

function prepareListDrop(view: EditorView, event: DragEvent) {
  view.dom.classList.remove("dragging")
  const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!dropPos || !(view.state.selection instanceof NodeSelection)) return false

  const dropped = view.state.selection.node
  if (!isList(dropped.type.name)) return false

  const $drop = view.state.doc.resolve(dropPos.pos)
  let inList = false
  let listDepth = 0
  for (let depth = $drop.depth; depth > 0; depth -= 1) {
    if (isList($drop.node(depth).type.name)) {
      inList = true
      listDepth = depth
      break
    }
  }

  let slice = view.state.selection.content()
  let content = slice.content
  if (!inList || listDepth !== $drop.depth) content = flattenList(content, view.state.schema)

  if (!inList) {
    const $from = view.state.doc.resolve(view.state.selection.from)
    let listType = "bulletList"
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const name = $from.node(depth).type.name
      if (name === "orderedList" || name === "bulletList") {
        listType = name
        break
      }
    }
    const listNode =
      listType === "orderedList"
        ? view.state.schema.nodes.orderedList
        : view.state.schema.nodes.bulletList
    if (listNode) content = Fragment.from(listNode.create(null, content))
  }

  view.dragging = { slice: new Slice(content, slice.openStart, slice.openEnd), move: !event.ctrlKey }
  return false
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

export function createEditorDragDrop(
  setDropLine: (line: BlockDropLine | null) => void,
  bridge: DragDropBridge,
) {
  const dragging = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes(EDITOR_BLOCK_DRAG_MIME) ||
    Boolean(activeDrag)

  const onDragOver = (view: EditorView, event: DragEvent) => {
    if (!dragging(event) && !bridge.isDraggingPage(event)) {
      setDropLine(null)
      return false
    }

    if (!bridge.shouldSkipDropLine(event) && !bridge.isOverDatabaseDrop(event)) {
      setDropLine(getEditorInsertDropTarget(view, event)?.line ?? null)
    } else {
      setDropLine(null)
    }

    if (bridge.isOverDatabaseDrop(event) && bridge.isDraggingPage(event)) {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
      return false
    }
    if (bridge.shouldSkipDropLine(event)) return false

    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = dragging(event) ? "move" : "copy"
    return false
  }

  const onDrop = (view: EditorView, event: DragEvent) => {
    setDropLine(null)
    if (bridge.dropPageOnDatabase(event)) return true

    const payload = parsePayload(event.dataTransfer)
    if (payload && !isList(payload.typeName)) {
      const target = getEditorInsertDropTarget(view, event)
      if (target && dropBlock(view, event, target.pos)) return true
    }

    if (bridge.insertDraggedPage(view, event)) return true
    return prepareListDrop(view, event)
  }

  const onLeave = (container: Node | null, event: DragEvent) => {
    if (container && event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) {
      return
    }
    setDropLine(null)
  }

  return {
    handleDrop: onDrop,
    domEvents: {
      dragover: onDragOver,
      dragend: (view: EditorView) => (setDropLine(null), clearDragState(view), false),
      dragleave: (view: EditorView, event: DragEvent) => (onLeave(view.dom, event), false),
    },
    surfaceProps: {
      onDragEnd: () => {
        setDropLine(null)
        clearDragState(bridge.getView())
      },
      onDragLeave: (event: ReactDragEvent<HTMLElement>) => onLeave(bridge.surfaceRef?.current ?? null, event.nativeEvent),
      onDragOver: (event: ReactDragEvent<HTMLElement>) => {
        const view = bridge.getView()
        if (view) onDragOver(view, event.nativeEvent)
      },
      onDrop: (event: ReactDragEvent<HTMLElement>) => {
        const view = bridge.getView()
        if (!view || (event.target instanceof Node && view.dom.contains(event.target))) return
        onDrop(view, event.nativeEvent)
      },
    },
  }
}
