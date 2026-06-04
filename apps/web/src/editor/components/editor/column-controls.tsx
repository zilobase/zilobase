import { useCallback, useEffect, useRef, useState } from "react"
import type { MouseEvent, PointerEvent } from "react"
import type { Editor } from "@tiptap/react"
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model"
import {
  Copy,
  Eraser,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Trash2,
} from "lucide-react"

type ColumnAxisRect = {
  height: number
  index: number
  left: number
  top: number
  width: number
}

type ColumnBlockRect = {
  columns: ColumnAxisRect[]
  height: number
  left: number
  node: ProseMirrorNode
  pos: number
  top: number
  width: number
}

type ColumnDragState = {
  dropPosition?: "before" | "after"
  from: number
  target: number
}

type ColumnMenuState = {
  index: number
  left: number
  top: number
}

const columnHandleGap = 4
const columnHandleHeight = 14
const minColumnWidth = 12
const columnMenuOffset = 8

function createColumnBlockRect(
  node: ProseMirrorNode,
  pos: number,
  dom: HTMLElement,
): ColumnBlockRect {
  const rect = dom.getBoundingClientRect()
  const columns = Array.from(
    dom.querySelectorAll<HTMLElement>(':scope > [data-type="column"]'),
    (column, index) => {
      const columnRect = column.getBoundingClientRect()

      return {
        height: columnRect.height,
        index,
        left: columnRect.left,
        top: columnRect.top,
        width: columnRect.width,
      }
    },
  )

  return {
    columns,
    height: rect.height,
    left: rect.left,
    node,
    pos,
    top: rect.top,
    width: rect.width,
  }
}

function getColumnWidths(node: ProseMirrorNode) {
  const widths = node.attrs.widths
  const count = node.childCount

  if (
    Array.isArray(widths) &&
    widths.length === count &&
    widths.every((width) => typeof width === "number" && Number.isFinite(width))
  ) {
    return widths as number[]
  }

  return Array.from({ length: count }, () => 100 / count)
}

function findColumnBlockByDOM(editor: Editor, dom: HTMLElement) {
  let match: ColumnBlockRect | null = null

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "columnBlock") {
      return
    }

    if (editor.view.nodeDOM(pos) === dom) {
      match = createColumnBlockRect(node, pos, dom)
      return false
    }
  })

  return match
}

function findColumnBlockByPos(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos)
  const dom = editor.view.nodeDOM(pos)

  if (node?.type.name !== "columnBlock" || !(dom instanceof HTMLElement)) {
    return null
  }

  return {
    dom,
    rect: createColumnBlockRect(node, pos, dom),
  }
}

function findHoveredColumnBlock(
  editor: Editor,
  target: EventTarget | null,
) {
  if (!(target instanceof Element)) {
    return null
  }

  const dom = target.closest<HTMLElement>('[data-type="columnBlock"]')

  if (!dom || !editor.view.dom.contains(dom)) {
    return null
  }

  const columnDom = target.closest<HTMLElement>('[data-type="column"]')
  const columns = Array.from(
    dom.querySelectorAll<HTMLElement>(':scope > [data-type="column"]'),
  )
  const columnIndex =
    columnDom && dom.contains(columnDom) ? columns.indexOf(columnDom) : null

  return {
    columnIndex: columnIndex === -1 ? null : columnIndex,
    dom,
    rect: findColumnBlockByDOM(editor, dom),
  }
}

function isColumnControlElement(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        ".column-reorder-control, .column-resize-control, .column-actions-menu",
      ),
    )
  )
}

function getColumnControlIndex(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null
  }

  const control = target.closest<HTMLElement>("[data-column-control-index]")
  const rawIndex = control?.dataset.columnControlIndex

  if (!rawIndex) {
    return null
  }

  const index = Number.parseInt(rawIndex, 10)

  return Number.isInteger(index) ? index : null
}

function getColumnIndexAtPoint(
  rect: ColumnBlockRect,
  clientX: number,
  clientY: number,
) {
  const isInsideColumnControlZone =
    clientX >= rect.left &&
    clientX <= rect.left + rect.width &&
    clientY >= rect.top - columnHandleHeight - columnHandleGap &&
    clientY <= rect.top + rect.height

  if (!isInsideColumnControlZone) {
    return null
  }

  const directColumn = rect.columns.find(
    (column) =>
      clientX >= column.left && clientX <= column.left + column.width,
  )

  if (directColumn) {
    return directColumn.index
  }

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

function getTargetIndex(rect: ColumnBlockRect, clientX: number) {
  const target = rect.columns.find((column) => {
    const center = column.left + column.width / 2

    return clientX < center
  })

  return target?.index ?? rect.columns.length - 1
}

function getColumnDropPosition(
  rect: ColumnBlockRect,
  clientX: number,
  clientY: number,
) {
  const isInsideRearrangeArea =
    clientX >= rect.left &&
    clientX <= rect.left + rect.width &&
    clientY >= rect.top - columnHandleHeight - columnHandleGap &&
    clientY <= rect.top + rect.height

  if (isInsideRearrangeArea) {
    return null
  }

  return clientY < rect.top + rect.height / 2 ? "before" : "after"
}

function reorder<T>(items: T[], from: number, to: number) {
  const nextItems = [...items]
  const [item] = nextItems.splice(from, 1)

  if (!item) {
    return nextItems
  }

  nextItems.splice(to, 0, item)
  return nextItems
}

function getChildNodes(node: ProseMirrorNode) {
  const children: ProseMirrorNode[] = []

  node.forEach((child) => children.push(child))

  return children
}

function getColumnContentNodes(editor: Editor, column: ProseMirrorNode) {
  const nodes: ProseMirrorNode[] = []

  column.content.forEach((node) => nodes.push(node))

  if (nodes.length > 0) {
    return nodes
  }

  const paragraph = editor.state.schema.nodes.paragraph

  return paragraph ? [paragraph.create()] : []
}

function normalizeWidths(widths: number[]) {
  const total = widths.reduce((sum, width) => sum + width, 0)

  if (!Number.isFinite(total) || total <= 0) {
    return Array.from({ length: widths.length }, () => 100 / widths.length)
  }

  return widths.map((width) => (width / total) * 100)
}

function createEmptyColumn(editor: Editor, columnType: ProseMirrorNode["type"]) {
  const paragraph = editor.state.schema.nodes.paragraph
  const content = paragraph ? Fragment.from(paragraph.create()) : undefined

  return columnType.create(null, content)
}

function insertWidth(widths: number[], index: number, width?: number) {
  const normalizedWidths = normalizeWidths(widths)
  const nextWidth = width ?? 100 / (normalizedWidths.length + 1)
  const scale = (100 - nextWidth) / 100
  const nextWidths = normalizedWidths.map((item) => item * scale)

  nextWidths.splice(index, 0, nextWidth)
  return normalizeWidths(nextWidths)
}

function updateColumnBlock(
  editor: Editor,
  rect: ColumnBlockRect,
  children: ProseMirrorNode[],
  widths: number[],
) {
  const nextNode = rect.node.type.create(
    {
      ...rect.node.attrs,
      widths,
    },
    Fragment.fromArray(children),
    rect.node.marks,
  )

  editor.view.dispatch(
    editor.state.tr
      .replaceWith(rect.pos, rect.pos + rect.node.nodeSize, nextNode)
      .scrollIntoView(),
  )
  editor.view.focus()
}

function replaceColumnBlockWithContent(
  editor: Editor,
  rect: ColumnBlockRect,
  content: ProseMirrorNode[],
) {
  editor.view.dispatch(
    editor.state.tr
      .replaceWith(
        rect.pos,
        rect.pos + rect.node.nodeSize,
        Fragment.fromArray(content),
      )
      .scrollIntoView(),
  )
  editor.view.focus()
}

function moveColumnToMainContent(
  editor: Editor,
  rect: ColumnBlockRect,
  from: number,
  dropPosition: "before" | "after",
) {
  const children = getChildNodes(rect.node)
  const sourceColumn = children[from]

  if (!sourceColumn) {
    return
  }

  const sourceContent = getColumnContentNodes(editor, sourceColumn)
  const remainingColumns = children.filter((_, index) => index !== from)
  const remainingWidths = getColumnWidths(rect.node).filter(
    (_, index) => index !== from,
  )
  const tr = editor.state.tr
  const blockEnd = rect.pos + rect.node.nodeSize

  if (remainingColumns.length >= 2) {
    const nextNode = rect.node.type.create(
      {
        ...rect.node.attrs,
        widths: normalizeWidths(remainingWidths),
      },
      Fragment.fromArray(remainingColumns),
      rect.node.marks,
    )

    tr.replaceWith(rect.pos, blockEnd, nextNode)

    const insertPos =
      dropPosition === "before" ? rect.pos : rect.pos + nextNode.nodeSize

    tr.insert(insertPos, Fragment.fromArray(sourceContent))
  } else {
    const remainingContent = remainingColumns.flatMap((column) =>
      getColumnContentNodes(editor, column),
    )
    const replacementContent =
      dropPosition === "before"
        ? [...sourceContent, ...remainingContent]
        : [...remainingContent, ...sourceContent]

    tr.replaceWith(rect.pos, blockEnd, Fragment.fromArray(replacementContent))
  }

  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
}

function insertColumn(editor: Editor, rect: ColumnBlockRect, index: number) {
  const children = getChildNodes(rect.node)
  const anchorColumn = children[Math.min(index, children.length - 1)]

  if (!anchorColumn) {
    return
  }

  children.splice(index, 0, createEmptyColumn(editor, anchorColumn.type))
  updateColumnBlock(
    editor,
    rect,
    children,
    insertWidth(getColumnWidths(rect.node), index),
  )
}

function duplicateColumn(editor: Editor, rect: ColumnBlockRect, index: number) {
  const children = getChildNodes(rect.node)
  const sourceColumn = children[index]

  if (!sourceColumn) {
    return
  }

  const insertIndex = index + 1

  children.splice(insertIndex, 0, sourceColumn.copy(sourceColumn.content))
  updateColumnBlock(
    editor,
    rect,
    children,
    insertWidth(getColumnWidths(rect.node), insertIndex, getColumnWidths(rect.node)[index]),
  )
}

function clearColumnContents(editor: Editor, rect: ColumnBlockRect, index: number) {
  const children = getChildNodes(rect.node)
  const sourceColumn = children[index]

  if (!sourceColumn) {
    return
  }

  children[index] = createEmptyColumn(editor, sourceColumn.type)
  updateColumnBlock(editor, rect, children, getColumnWidths(rect.node))
}

function deleteColumn(editor: Editor, rect: ColumnBlockRect, index: number) {
  const children = getChildNodes(rect.node)
  const remainingColumns = children.filter((_, childIndex) => childIndex !== index)

  if (remainingColumns.length >= 2) {
    updateColumnBlock(
      editor,
      rect,
      remainingColumns,
      normalizeWidths(
        getColumnWidths(rect.node).filter((_, widthIndex) => widthIndex !== index),
      ),
    )
    return
  }

  const remainingContent = remainingColumns.flatMap((column) =>
    getColumnContentNodes(editor, column),
  )

  replaceColumnBlockWithContent(editor, rect, remainingContent)
}

export function ColumnControls({ editor }: { editor: Editor | null }) {
  const [rect, setRect] = useState<ColumnBlockRect | null>(null)
  const [dragPreview, setDragPreview] = useState<ColumnDragState | null>(null)
  const [hoveredColumnIndex, setHoveredColumnIndex] = useState<number | null>(
    null,
  )
  const [menu, setMenu] = useState<ColumnMenuState | null>(null)
  const dragState = useRef<ColumnDragState | null>(null)
  const hoveredColumnBlockRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<ColumnMenuState | null>(null)
  const rectRef = useRef<ColumnBlockRect | null>(null)
  const pointerState = useRef<{
    moved: boolean
    x: number
    y: number
  } | null>(null)

  const updateRect = useCallback(() => {
    if (!editor) {
      setRect(null)
      setHoveredColumnIndex(null)
      return
    }

    const hoveredColumnBlock = hoveredColumnBlockRef.current
      ? findColumnBlockByDOM(editor, hoveredColumnBlockRef.current)
      : null
    const fallbackColumnBlock =
      !hoveredColumnBlock && rectRef.current
        ? findColumnBlockByPos(editor, rectRef.current.pos)
        : null
    const nextRect = hoveredColumnBlock ?? fallbackColumnBlock?.rect ?? null

    if (fallbackColumnBlock) {
      hoveredColumnBlockRef.current = fallbackColumnBlock.dom
    }

    setRect(nextRect)
    if (!nextRect) {
      setHoveredColumnIndex(null)
      return
    }

    setHoveredColumnIndex((index) =>
      index === null ? null : Math.min(index, nextRect.columns.length - 1),
    )
  }, [editor])

  useEffect(() => {
    menuRef.current = menu
  }, [menu])

  useEffect(() => {
    rectRef.current = rect
  }, [rect])

  useEffect(() => {
    if (!editor) {
      setRect(null)
      return
    }

    const updateOnNextFrame = () => requestAnimationFrame(updateRect)
    const updateHoveredColumnBlock = (event: globalThis.PointerEvent) => {
      if (
        dragState.current ||
        pointerState.current ||
        menuRef.current
      ) {
        return
      }

      const currentRect = rectRef.current
      const controlIndex = getColumnControlIndex(event.target)

      if (currentRect && controlIndex !== null) {
        setRect(currentRect)
        setHoveredColumnIndex(controlIndex)
        return
      }

      const controlZoneIndex = currentRect
        ? getColumnIndexAtPoint(currentRect, event.clientX, event.clientY)
        : null

      if (currentRect && controlZoneIndex !== null) {
        setRect(currentRect)
        setHoveredColumnIndex(controlZoneIndex)
        return
      }

      if (isColumnControlElement(event.target)) {
        return
      }

      const hoveredColumnBlock = findHoveredColumnBlock(editor, event.target)

      hoveredColumnBlockRef.current = hoveredColumnBlock?.dom ?? null
      setRect(hoveredColumnBlock?.rect ?? null)
      setHoveredColumnIndex(hoveredColumnBlock?.columnIndex ?? null)
    }

    updateRect()
    editor.on("selectionUpdate", updateOnNextFrame)
    editor.on("transaction", updateOnNextFrame)
    window.addEventListener("pointermove", updateHoveredColumnBlock, true)
    window.addEventListener("resize", updateRect)
    window.addEventListener("scroll", updateRect, true)

    return () => {
      editor.off("selectionUpdate", updateOnNextFrame)
      editor.off("transaction", updateOnNextFrame)
      window.removeEventListener("pointermove", updateHoveredColumnBlock, true)
      window.removeEventListener("resize", updateRect)
      window.removeEventListener("scroll", updateRect, true)
    }
  }, [editor, updateRect])

  useEffect(() => {
    if (!menu) {
      return
    }

    const close = () => setMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close()
      }
    }

    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [menu])

  if (!editor || !rect || rect.columns.length < 2) {
    return null
  }

  const setDrag = (nextDrag: ColumnDragState | null) => {
    dragState.current = nextDrag
    setDragPreview(nextDrag)
  }

  const finishDrag = () => {
    const currentDrag = dragState.current

    setDrag(null)

    if (!currentDrag) {
      return
    }

    if (currentDrag.dropPosition) {
      moveColumnToMainContent(
        editor,
        rect,
        currentDrag.from,
        currentDrag.dropPosition,
      )
      requestAnimationFrame(updateRect)
      return
    }

    if (currentDrag.from === currentDrag.target) {
      return
    }

    const children = getChildNodes(rect.node)
    const nextHoveredIndex = Math.min(
      currentDrag.target,
      rect.columns.length - 1,
    )

    updateColumnBlock(
      editor,
      rect,
      reorder(children, currentDrag.from, currentDrag.target),
      reorder(getColumnWidths(rect.node), currentDrag.from, currentDrag.target),
    )
    setHoveredColumnIndex(nextHoveredIndex)
    requestAnimationFrame(() => {
      const nextColumnBlock = findColumnBlockByPos(editor, rect.pos)

      if (!nextColumnBlock) {
        updateRect()
        return
      }

      hoveredColumnBlockRef.current = nextColumnBlock.dom
      setRect(nextColumnBlock.rect)
    })
  }

  const runColumnCommand = (command: () => void) => {
    command()
    setMenu(null)
    requestAnimationFrame(updateRect)
  }

  const startDrag = (
    from: number,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerState.current = {
      moved: false,
      x: event.clientX,
      y: event.clientY,
    }
    setDrag({ from, target: from })
    setMenu(null)

    const removeListeners = () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
    }

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const currentDrag = dragState.current

      if (!currentDrag) {
        removeListeners()
        return
      }

      const pointer = pointerState.current
      const deltaX = pointer ? Math.abs(moveEvent.clientX - pointer.x) : 0
      const deltaY = pointer ? Math.abs(moveEvent.clientY - pointer.y) : 0

      if (pointer && (deltaX > 4 || deltaY > 4)) {
        pointer.moved = true
      }

      const dropPosition = getColumnDropPosition(
        rect,
        moveEvent.clientX,
        moveEvent.clientY,
      )

      if (dropPosition) {
        if (currentDrag.dropPosition === dropPosition) {
          return
        }

        setDrag({ ...currentDrag, dropPosition })
        return
      }

      const target = getTargetIndex(rect, moveEvent.clientX)

      if (
        target === currentDrag.target &&
        currentDrag.dropPosition === undefined
      ) {
        return
      }

      setDrag({ ...currentDrag, dropPosition: undefined, target })
    }

    const handlePointerUp = () => {
      removeListeners()
      pointerState.current = null
      finishDrag()
    }

    const handlePointerCancel = () => {
      removeListeners()
      setDrag(null)
      pointerState.current = null
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
  }

  const openColumnMenu = (
    column: ColumnAxisRect,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    if (pointerState.current?.moved) {
      pointerState.current = null
      return
    }

    pointerState.current = null
    setMenu({
      index: column.index,
      left: column.left,
      top: rect.top - columnHandleHeight - columnHandleGap + columnHandleHeight + columnMenuOffset,
    })
  }

  const startResize = (
    index: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)

    const startX = event.clientX
    const startWidths = getColumnWidths(rect.node)
    const pairTotal = startWidths[index] + startWidths[index + 1]

    const removeListeners = () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = ((moveEvent.clientX - startX) / rect.width) * 100
      const leftWidth = Math.max(
        minColumnWidth,
        Math.min(pairTotal - minColumnWidth, startWidths[index] + delta),
      )
      const rightWidth = pairTotal - leftWidth
      const nextWidths = [...startWidths]

      nextWidths[index] = leftWidth
      nextWidths[index + 1] = rightWidth

      const children: ProseMirrorNode[] = []
      rect.node.forEach((child) => children.push(child))
      updateColumnBlock(editor, rect, children, nextWidths)
    }

    const handlePointerUp = () => {
      removeListeners()
      requestAnimationFrame(updateRect)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
  }

  const dragTarget = dragPreview ? rect.columns[dragPreview.target] : null
  const extractionDropTop =
    dragPreview?.dropPosition === "before"
      ? rect.top
      : dragPreview?.dropPosition === "after"
        ? rect.top + rect.height
        : null
  const dropLinePosition =
    dragPreview && !dragPreview.dropPosition && dragTarget
      ? dragPreview.target > dragPreview.from
        ? dragTarget.left + dragTarget.width
        : dragTarget.left
      : null
  const visibleColumnIndex =
    dragPreview?.from ?? menu?.index ?? hoveredColumnIndex
  const resizeHandleColumns =
    visibleColumnIndex === null
      ? []
      : rect.columns
          .slice(0, -1)
          .filter(
            (column) =>
              column.index === visibleColumnIndex ||
              column.index + 1 === visibleColumnIndex,
          )

  return (
    <>
      {dropLinePosition !== null ? (
        <div
          aria-hidden="true"
          className="column-drag-drop-line column-drag-drop-line-vertical"
          style={{
            height: rect.height,
            left: dropLinePosition,
            top: rect.top,
          }}
        />
      ) : null}
      {extractionDropTop !== null ? (
        <div
          aria-hidden="true"
          className="column-drag-drop-line column-drag-drop-line-horizontal"
          style={{
            left: rect.left,
            top: extractionDropTop,
            width: rect.width,
          }}
        />
      ) : null}
      {rect.columns
        .filter((column) => column.index === visibleColumnIndex)
        .map((column) => (
        <button
          aria-label="Open column actions"
          className="column-reorder-control"
          data-column-control-index={column.index}
          data-dragging={
            dragPreview?.from === column.index ? "true" : undefined
          }
          key={column.index}
          onClick={(event) => openColumnMenu(column, event)}
          onPointerDown={(event) => startDrag(column.index, event)}
          style={{
            height: columnHandleHeight,
            left: column.left,
            top: rect.top - columnHandleHeight - columnHandleGap,
            width: column.width,
          }}
          title="Column actions"
          type="button"
        >
          <MoreHorizontal />
        </button>
      ))}
      {menu ? (
        <div
          className="column-actions-menu"
          data-column-control-index={menu.index}
          onMouseDown={(event) => event.stopPropagation()}
          style={{
            left: menu.left,
            top: menu.top,
          }}
        >
          <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
            Column
          </div>
          <button
            className="column-actions-menu-item"
            onClick={() =>
              runColumnCommand(() => insertColumn(editor, rect, menu.index))
            }
            type="button"
          >
            <PanelLeft />
            <span>Insert left</span>
          </button>
          <button
            className="column-actions-menu-item"
            onClick={() =>
              runColumnCommand(() => insertColumn(editor, rect, menu.index + 1))
            }
            type="button"
          >
            <PanelRight />
            <span>Insert right</span>
          </button>
          <button
            className="column-actions-menu-item"
            onClick={() =>
              runColumnCommand(() => duplicateColumn(editor, rect, menu.index))
            }
            type="button"
          >
            <Copy />
            <span>Duplicate</span>
          </button>
          <button
            className="column-actions-menu-item"
            onClick={() =>
              runColumnCommand(() => clearColumnContents(editor, rect, menu.index))
            }
            type="button"
          >
            <Eraser />
            <span>Clear contents</span>
          </button>
          <div className="-mx-1 my-1 h-px bg-border" />
          <button
            className="column-actions-menu-item text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10"
            onClick={() =>
              runColumnCommand(() => deleteColumn(editor, rect, menu.index))
            }
            type="button"
          >
            <Trash2 />
            <span>Delete</span>
          </button>
        </div>
      ) : null}
      {resizeHandleColumns.map((column) => (
        <div
          aria-label="Resize column"
          className="column-resize-control"
          data-column-control-index={visibleColumnIndex}
          key={column.index}
          onPointerDown={(event) => startResize(column.index, event)}
          role="separator"
          style={{
            height: rect.height,
            left: column.left + column.width,
            top: rect.top,
          }}
          title="Resize column"
        />
      ))}
    </>
  )
}
