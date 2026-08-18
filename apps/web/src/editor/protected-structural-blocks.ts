import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorState } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

export const protectedStructuralBlockTypes = [
  "databaseBlock",
  "meetingBlock",
] as const

export type ProtectedStructuralBlockType =
  (typeof protectedStructuralBlockTypes)[number]

export type ProtectedStructuralBlockTarget = {
  node: ProseMirrorNode
  pos: number
  type: ProtectedStructuralBlockType
}

export function isProtectedStructuralBlockType(
  typeName: string,
): typeName is ProtectedStructuralBlockType {
  return protectedStructuralBlockTypes.includes(
    typeName as ProtectedStructuralBlockType,
  )
}

function targetForNode(node: ProseMirrorNode, pos: number) {
  return isProtectedStructuralBlockType(node.type.name)
    ? { node, pos, type: node.type.name }
    : null
}

export function getProtectedStructuralBlockForDelete(
  state: EditorState,
): ProtectedStructuralBlockTarget | null {
  const { selection } = state
  const selectedNode = (selection as { node?: ProseMirrorNode }).node

  if (selectedNode) {
    return targetForNode(selectedNode, selection.from)
  }

  if (selection.empty && selection.$from.nodeBefore) {
    const nodeBefore = selection.$from.nodeBefore
    const target = targetForNode(
      nodeBefore,
      selection.from - nodeBefore.nodeSize,
    )

    if (target) {
      return target
    }
  }

  if (
    selection.empty &&
    selection.$from.parent.isTextblock &&
    selection.$from.parentOffset === 0 &&
    selection.$from.depth > 0
  ) {
    const parentDepth = selection.$from.depth - 1
    const siblingIndex = selection.$from.index(parentDepth)

    if (siblingIndex > 0) {
      const previousNode = selection.$from.node(parentDepth).child(siblingIndex - 1)
      const currentNodePos = selection.$from.before(selection.$from.depth)
      return targetForNode(previousNode, currentNodePos - previousNode.nodeSize)
    }
  }

  let found: ProtectedStructuralBlockTarget | null = null

  if (!selection.empty) {
    state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      const target = targetForNode(node, pos)

      if (target) {
        found = target
        return false
      }

      return found === null
    })
  }

  return found
}

export function focusProtectedStructuralBlockTitle(
  view: EditorView,
  target: ProtectedStructuralBlockTarget,
) {
  if (target.type === "databaseBlock" && target.node.attrs.showTitle === false) {
    view.dispatch(
      view.state.tr.setNodeMarkup(target.pos, undefined, {
        ...target.node.attrs,
        showTitle: true,
      }),
    )
  }

  window.setTimeout(() => {
    const nodeDom = view.nodeDOM(target.pos)
    const root =
      nodeDom instanceof HTMLElement
        ? nodeDom
        : nodeDom?.parentElement ?? null
    const input = root?.querySelector<HTMLInputElement>(
      "[data-structural-block-title]",
    )

    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)
  }, 0)
}

export function handleProtectedStructuralBlockDeleteKey(
  view: EditorView,
  event: KeyboardEvent,
) {
  const isDeleteKey = event.key === "Backspace" || event.key === "Delete"
  const replacesSelection =
    !view.state.selection.empty &&
    (event.key === "Enter" || event.key.length === 1)

  if (!isDeleteKey && !replacesSelection) {
    return false
  }

  const target = getProtectedStructuralBlockForDelete(view.state)

  if (!target) {
    return false
  }

  event.preventDefault()
  focusProtectedStructuralBlockTitle(view, target)
  return true
}

export function handleProtectedStructuralBlockClipboardMutation(
  view: EditorView,
  event: ClipboardEvent,
) {
  if (view.state.selection.empty) {
    return false
  }

  const target = getProtectedStructuralBlockForDelete(view.state)

  if (!target) {
    return false
  }

  event.preventDefault()
  focusProtectedStructuralBlockTitle(view, target)
  return true
}
