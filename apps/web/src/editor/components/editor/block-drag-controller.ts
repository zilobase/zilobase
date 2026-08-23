import type { DragEvent as ReactDragEvent } from "react"
import type { EditorView } from "@tiptap/pm/view"

import type { BlockDropLine } from "@/editor/types"
import { dropEditorBlock, prepareEditorListDrop } from "./block-drop"
import { getEditorInsertDropTarget } from "./block-drag-geometry"
import {
  getDraggedEditorBlockPayload,
  hasEditorBlockDragData,
  isMultiBlockDragPayload,
  isListItemType,
  resetBlockDragSession,
} from "./block-drag-session"

export type DragDropBridge = {
  deferCrossEditorDatabaseDrop: (
    view: EditorView,
    payload: NonNullable<ReturnType<typeof getDraggedEditorBlockPayload>>,
    pos: number,
  ) => boolean
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
    const isBlockDrag = hasEditorBlockDragData(event.dataTransfer)
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

    const payload = getDraggedEditorBlockPayload(event.dataTransfer)
    if (
      payload &&
      (isMultiBlockDragPayload(payload) || !isListItemType(payload.typeName))
    ) {
      const target = getEditorInsertDropTarget(view, event)
      if (
        target &&
        payload.typeName === "databaseBlock" &&
        bridge.deferCrossEditorDatabaseDrop(view, payload, target.pos)
      ) {
        event.preventDefault()
        return true
      }
      if (target && dropEditorBlock(view, event, target.pos)) return true
    }

    if (bridge.insertDraggedPage(view, event)) return true
    return prepareEditorListDrop(view, event)
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
    resetBlockDragSession(view)
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
      onDragOverCapture: (event: ReactDragEvent<HTMLElement>) => {
        const nativeEvent = event.nativeEvent

        // Database node views own their internal drag events, so ProseMirror's
        // dragover handler may not see this transition. Clear the page-level
        // insertion line before the database renders its row drop line.
        if (
          bridge.isDraggingPage(nativeEvent) &&
          bridge.isOverDatabaseDrop(nativeEvent)
        ) {
          clearDropLine()
        }
      },
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
