import { Extension } from "@tiptap/core"
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model"
import {
  AllSelection,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Selection,
} from "@tiptap/pm/state"
import {
  Decoration,
  DecorationSet,
  type EditorView,
} from "@tiptap/pm/view"

import { selectionAiPreviewPluginKey } from "./selection-ai-preview"

export const blockSelectionPluginKey = new PluginKey("blockSelection")

export type BlockRange = { from: number; to: number }

type BlockSelectionMode = "none" | "all"

type BlockSelectionPluginState = {
  decorations: DecorationSet
  mode: BlockSelectionMode
}

type BlockSelectionMeta = { type: "select-all" }

const emptyPluginState = (): BlockSelectionPluginState => ({
  decorations: DecorationSet.empty,
  mode: "none",
})

const blockSelectionNavigationKeys = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Escape",
  "Home",
  "PageDown",
  "PageUp",
])

const modifierKeys = new Set(["Alt", "Control", "Meta", "Shift"])

const dragInputTypes = new Set(["deleteByDrag", "insertFromDrop"])

export const isBlockSelectionActive = (state: EditorState) =>
  blockSelectionPluginKey.getState(state)?.mode === "all"

export const shouldBlockBlockSelectionKeydown = (
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey">,
) => {
  const primaryModifier = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()

  if (
    modifierKeys.has(event.key) ||
    blockSelectionNavigationKeys.has(event.key)
  ) {
    return false
  }

  if (!event.altKey && primaryModifier && (key === "a" || key === "c")) {
    return false
  }

  if (!event.altKey && event.ctrlKey && event.key === "Insert") {
    return false
  }

  return true
}

export const handleBlockSelectionKeyDown = (
  view: EditorView,
  event: KeyboardEvent,
) => {
  if (
    !isBlockSelectionActive(view.state) ||
    !shouldBlockBlockSelectionKeydown(event)
  ) {
    return false
  }

  event.preventDefault()
  return true
}

export const handleBlockSelectionBeforeInput = (
  view: EditorView,
  event: InputEvent,
) => {
  if (
    !isBlockSelectionActive(view.state) ||
    dragInputTypes.has(event.inputType)
  ) {
    return false
  }

  event.preventDefault()
  return true
}

export const handleBlockSelectionClipboardMutation = (
  view: EditorView,
  event: ClipboardEvent,
) => {
  if (!isBlockSelectionActive(view.state)) {
    return false
  }

  event.preventDefault()
  return true
}

const listContainerTypes = new Set([
  "bulletList",
  "orderedList",
  "taskList",
])

const getActiveBlockContentRange = ($pos: ResolvedPos): BlockRange | null => {
  if ($pos.parent.isTextblock) {
    return { from: $pos.start(), to: $pos.end() }
  }

  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (node.isTextblock) {
      return { from: $pos.start(depth), to: $pos.end(depth) }
    }
  }

  return null
}

const addBlockRange = (
  ranges: Map<string, BlockRange>,
  node: ProseMirrorNode,
  from: number,
  to: number,
  selectionFrom: number,
  selectionTo: number,
) => {
  const contentFrom = node.isLeaf || node.isAtom ? from : from + 1
  const contentTo = node.isLeaf || node.isAtom ? to : to - 1

  if (contentTo <= selectionFrom || contentFrom >= selectionTo) {
    return
  }

  ranges.set(`${from}:${to}`, { from, to })
}

export const getBlockSelectionRanges = (
  doc: ProseMirrorNode,
  selectionFrom: number,
  selectionTo: number,
) => {
  const ranges = new Map<string, BlockRange>()

  doc.descendants((node, pos, parent) => {
    if (parent?.type.name === "doc") {
      if (listContainerTypes.has(node.type.name)) {
        return
      }

      if (node.isBlock) {
        addBlockRange(
          ranges,
          node,
          pos,
          pos + node.nodeSize,
          selectionFrom,
          selectionTo,
        )
        return false
      }

      return
    }

    if (node.type.name === "listItem") {
      addBlockRange(
        ranges,
        node,
        pos,
        pos + node.nodeSize,
        selectionFrom,
        selectionTo,
      )
      return false
    }

    if (node.type.name === "taskItem") {
      addBlockRange(
        ranges,
        node,
        pos,
        pos + node.nodeSize,
        selectionFrom,
        selectionTo,
      )
      return false
    }
  })

  return [...ranges.values()]
}

export const getSelectedBlockRangesForTarget = (
  doc: ProseMirrorNode,
  selectionFrom: number,
  selectionTo: number,
  targetPos: number,
) => {
  if (selectionFrom === selectionTo) return []

  const ranges = getBlockSelectionRanges(doc, selectionFrom, selectionTo)
  if (ranges.length < 2) return []

  return ranges.some(
    (range) => targetPos >= range.from && targetPos < range.to,
  )
    ? ranges
    : []
}

export const getSelectedTaskItemPositions = (
  doc: ProseMirrorNode,
  selectionFrom: number,
  selectionTo: number,
  targetPos: number,
) =>
  getSelectedBlockRangesForTarget(
    doc,
    selectionFrom,
    selectionTo,
    targetPos,
  ).flatMap((range) =>
    doc.nodeAt(range.from)?.type.name === "taskItem" ? [range.from] : [],
  )

const createBlockSelectionDecorations = (
  doc: ProseMirrorNode,
  selectionFrom: number,
  selectionTo: number,
) => {
  return getBlockSelectionRanges(doc, selectionFrom, selectionTo).map((range) =>
    Decoration.node(range.from, range.to, {
      class: "editor-block-selection",
    }),
  )
}

export const buildAllBlockDecorations = (
  doc: ProseMirrorNode,
  selection: Selection,
) =>
  DecorationSet.create(
    doc,
    createBlockSelectionDecorations(doc, selection.from, selection.to),
  )

export const BlockSelection = Extension.create({
  name: "blockSelection",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      "Mod-a": ({ editor }) => {
        const { state } = editor
        const { selection, doc } = state

        if (selection instanceof AllSelection) {
          return true
        }

        const contentRange = getActiveBlockContentRange(selection.$anchor)

        if (!contentRange) {
          const tr = state.tr.setSelection(new AllSelection(doc))
          tr.setMeta(blockSelectionPluginKey, { type: "select-all" } satisfies BlockSelectionMeta)
          editor.view.dispatch(tr)
          return true
        }

        const blockFullySelected =
          selection.from === contentRange.from && selection.to === contentRange.to

        if (blockFullySelected) {
          const tr = state.tr.setSelection(new AllSelection(doc))
          tr.setMeta(blockSelectionPluginKey, { type: "select-all" } satisfies BlockSelectionMeta)
          editor.view.dispatch(tr)
          return true
        }

        const tr = state.tr.setSelection(
          TextSelection.create(doc, contentRange.from, contentRange.to),
        )
        editor.view.dispatch(tr)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<BlockSelectionPluginState>({
        key: blockSelectionPluginKey,
        state: {
          init: emptyPluginState,
          apply(tr, previous, _oldState, newState) {
            if (selectionAiPreviewPluginKey.getState(newState)) {
              return emptyPluginState()
            }

            const meta = tr.getMeta(blockSelectionPluginKey) as
              | BlockSelectionMeta
              | undefined

            if (meta?.type === "select-all") {
              return {
                mode: "all",
                decorations: buildAllBlockDecorations(
                  newState.doc,
                  newState.selection,
                ),
              }
            }

            if (tr.selectionSet) {
              return emptyPluginState()
            }

            if (tr.docChanged && previous.mode !== "none") {
              return {
                ...previous,
                decorations: buildAllBlockDecorations(
                  newState.doc,
                  newState.selection,
                ),
              }
            }

            return previous
          },
        },
        props: {
          decorations(state) {
            return blockSelectionPluginKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
        view(view) {
          const syncNativeSelectionVisibility = () => {
            const pluginState = blockSelectionPluginKey.getState(view.state)
            const useBlockHighlight = pluginState?.mode === "all"

            view.dom.classList.toggle(
              "ProseMirror-hideselection",
              view.hasFocus() && view.editable && useBlockHighlight,
            )
          }

          syncNativeSelectionVisibility()

          return {
            update() {
              syncNativeSelectionVisibility()
            },
            destroy() {
              view.dom.classList.remove("ProseMirror-hideselection")
            },
          }
        },
      }),
    ]
  },
})
