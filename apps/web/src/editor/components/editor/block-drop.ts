import {
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

import {
  deleteBlockDragSource,
  findBlockDragSourceNode,
  getBlockDragSourceEditor,
  getDraggedEditorBlockPayload,
  isListItemType,
  resetBlockDragSession,
} from "./block-drag-session"

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

export function dropEditorBlock(
  view: EditorView,
  event: DragEvent,
  pos: number,
) {
  const payload = getDraggedEditorBlockPayload(event.dataTransfer)
  if (!payload) return false

  let node: ProseMirrorNode
  try {
    node = view.state.schema.nodeFromJSON(payload.node)
  } catch {
    return false
  }

  if (!canInsertNodeAt(view, pos, node)) return false

  const source = getBlockDragSourceEditor(payload.editorId)
  let insertPos = pos
  let transaction = view.state.tr

  if (source?.view === view) {
    const dragged = findBlockDragSourceNode(view, payload)
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
  if (source && source.view !== view) {
    deleteBlockDragSource(source.view, payload)
  }

  event.preventDefault()
  resetBlockDragSession(view)
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

export function prepareEditorListDrop(view: EditorView, event: DragEvent) {
  view.dom.classList.remove("dragging")

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
