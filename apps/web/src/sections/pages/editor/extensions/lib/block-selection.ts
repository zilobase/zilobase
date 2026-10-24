import { getProtectedStructuralBlockForDelete } from "../../paste/lib/protected-structural-blocks";
import { getSelectionRanges, NodeRangeSelection } from "@tiptap/extension-node-range";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import {
  AllSelection,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Selection,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { createBlockMarquee } from "../../selection/lib/block-marquee";
import { BlockRangeSelection } from "../../selection/lib/block-range-selection";

export const blockSelectionPluginKey = new PluginKey("blockSelection");
export const blockMenuSelectionPluginKey = new PluginKey<DecorationSet>("blockMenuSelection");

export type BlockRange = { from: number; to: number };

type BlockSelectionMode = "none" | "all" | "range";

type BlockSelectionPluginState = {
  decorations: DecorationSet;
  mode: BlockSelectionMode;
};

type BlockSelectionMeta = { type: "select-all" | "select-range" | "clear" };

const emptyPluginState = (): BlockSelectionPluginState => ({
  decorations: DecorationSet.empty,
  mode: "none",
});

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
]);

const modifierKeys = new Set(["Alt", "Control", "Meta", "Shift"]);

const dragInputTypes = new Set(["deleteByDrag", "insertFromDrop"]);

export const isBlockSelectionActive = (state: EditorState) =>
  (blockSelectionPluginKey.getState(state)?.mode ?? "none") !== "none";

export const shouldBlockBlockSelectionKeydown = (
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey">,
  protectedSelection = false,
) => {
  if (!protectedSelection) return false;
  const primaryModifier = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();

  if (modifierKeys.has(event.key) || blockSelectionNavigationKeys.has(event.key)) {
    return false;
  }

  if (!event.altKey && primaryModifier && (key === "a" || key === "c")) {
    return false;
  }

  if (!event.altKey && event.ctrlKey && event.key === "Insert") {
    return false;
  }

  return true;
};

export const handleBlockSelectionKeyDown = (view: EditorView, event: KeyboardEvent) => {
  if (
    !isBlockSelectionActive(view.state) ||
    !shouldBlockBlockSelectionKeydown(
      event,
      Boolean(getProtectedStructuralBlockForDelete(view.state)),
    )
  ) {
    return false;
  }

  event.preventDefault();
  return true;
};

export const handleBlockSelectionBeforeInput = (view: EditorView, event: InputEvent) => {
  if (
    !isBlockSelectionActive(view.state) ||
    !getProtectedStructuralBlockForDelete(view.state) ||
    dragInputTypes.has(event.inputType)
  ) {
    return false;
  }

  event.preventDefault();
  return true;
};

export const handleBlockSelectionClipboardMutation = (view: EditorView, event: ClipboardEvent) => {
  if (!isBlockSelectionActive(view.state) || !getProtectedStructuralBlockForDelete(view.state)) {
    return false;
  }

  event.preventDefault();
  return true;
};

const listContainerTypes = new Set(["bulletList", "orderedList", "taskList"]);

const getActiveBlockContentRange = ($pos: ResolvedPos): BlockRange | null => {
  if ($pos.parent.isTextblock) {
    return { from: $pos.start(), to: $pos.end() };
  }

  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.isTextblock) {
      return { from: $pos.start(depth), to: $pos.end(depth) };
    }
  }

  return null;
};

const addBlockRange = (
  ranges: Map<string, BlockRange>,
  node: ProseMirrorNode,
  from: number,
  to: number,
  selectionFrom: number,
  selectionTo: number,
) => {
  const contentFrom = node.isLeaf || node.isAtom ? from : from + 1;
  const contentTo = node.isLeaf || node.isAtom ? to : to - 1;

  if (contentTo <= selectionFrom || contentFrom >= selectionTo) {
    return;
  }

  ranges.set(`${from}:${to}`, { from, to });
};

export const getBlockSelectionRanges = (
  doc: ProseMirrorNode,
  selectionFrom: number,
  selectionTo: number,
) => {
  const ranges = new Map<string, BlockRange>();

  const aligned = getSelectionRanges(
    doc.resolve(selectionFrom),
    doc.resolve(selectionTo),
    undefined,
    { extendOnBoundaryOverlap: false },
  );
  const start = aligned[0]?.$from.pos ?? selectionFrom;
  const end = aligned.at(-1)?.$to.pos ?? selectionTo;
  doc.nodesBetween(start, end, (node, pos, parent) => {
    if (parent?.type.name === "doc") {
      if (listContainerTypes.has(node.type.name)) {
        return;
      }

      if (node.isBlock) {
        addBlockRange(ranges, node, pos, pos + node.nodeSize, selectionFrom, selectionTo);
        return false;
      }

      return;
    }

    if (node.type.name === "listItem") {
      addBlockRange(ranges, node, pos, pos + node.nodeSize, selectionFrom, selectionTo);
      return false;
    }

    if (node.type.name === "taskItem") {
      addBlockRange(ranges, node, pos, pos + node.nodeSize, selectionFrom, selectionTo);
      return false;
    }
  });

  return [...ranges.values()];
};

export const getSelectedBlockRangesForTarget = (
  doc: ProseMirrorNode,
  selectionFrom: number,
  selectionTo: number,
  targetPos: number,
) => {
  if (selectionFrom === selectionTo) return [];

  const ranges = getBlockSelectionRanges(doc, selectionFrom, selectionTo);
  if (ranges.length < 2) return [];

  return ranges.some((range) => targetPos >= range.from && targetPos < range.to) ? ranges : [];
};

export const getSelectedTaskItemPositions = (
  doc: ProseMirrorNode,
  selectionFrom: number,
  selectionTo: number,
  targetPos: number,
) =>
  getSelectedBlockRangesForTarget(doc, selectionFrom, selectionTo, targetPos).flatMap((range) =>
    doc.nodeAt(range.from)?.type.name === "taskItem" ? [range.from] : [],
  );

const createBlockSelectionDecorations = (
  doc: ProseMirrorNode,
  selectionFrom: number,
  selectionTo: number,
) => {
  return getBlockSelectionRanges(doc, selectionFrom, selectionTo).map((range) =>
    Decoration.node(range.from, range.to, {
      class: "editor-block-selection",
    }),
  );
};

export const buildAllBlockDecorations = (doc: ProseMirrorNode, selection: Selection) =>
  DecorationSet.create(doc, createBlockSelectionDecorations(doc, selection.from, selection.to));

export const BlockSelection = Extension.create({
  name: "blockSelection",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Escape: ({ editor }) => {
        if (!isBlockSelectionActive(editor.state)) return false;
        const { selection, doc } = editor.state;
        editor.view.dispatch(
          editor.state.tr.setSelection(TextSelection.near(doc.resolve(selection.from))),
        );
        return true;
      },
      "Mod-a": ({ editor }) => {
        const { state } = editor;
        const { selection, doc } = state;

        if (
          selection instanceof AllSelection ||
          blockSelectionPluginKey.getState(state)?.mode === "all"
        ) {
          return true;
        }

        if (isBlockSelectionActive(state)) {
          editor.view.dispatch(
            state.tr
              .setSelection(NodeRangeSelection.create(doc, 0, doc.content.size, 0))
              .setMeta(blockSelectionPluginKey, {
                type: "select-all",
              } satisfies BlockSelectionMeta),
          );
          return true;
        }

        const contentRange = getActiveBlockContentRange(selection.$anchor);

        if (!contentRange) {
          const tr = state.tr.setSelection(NodeRangeSelection.create(doc, 0, doc.content.size, 0));
          tr.setMeta(blockSelectionPluginKey, { type: "select-all" } satisfies BlockSelectionMeta);
          editor.view.dispatch(tr);
          return true;
        }

        const blockFullySelected =
          selection.from === contentRange.from && selection.to === contentRange.to;

        if (blockFullySelected) {
          const tr = state.tr.setSelection(NodeRangeSelection.create(doc, 0, doc.content.size, 0));
          tr.setMeta(blockSelectionPluginKey, { type: "select-all" } satisfies BlockSelectionMeta);
          editor.view.dispatch(tr);
          return true;
        }

        const tr = state.tr.setSelection(
          TextSelection.create(doc, contentRange.from, contentRange.to),
        );
        editor.view.dispatch(tr);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      // Menu focus lives outside the editor. Paint its target without moving the
      // text selection or enabling select-all's keyboard guards.
      new Plugin<DecorationSet>({
        key: blockMenuSelectionPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, previous) {
            const target = tr.getMeta(blockMenuSelectionPluginKey) as
              | { pos: number | null }
              | undefined;

            if (target) {
              const { pos } = target;
              if (pos === null || pos < 0 || pos >= tr.doc.content.size) {
                return DecorationSet.empty;
              }

              const node = tr.doc.nodeAt(pos);
              return node?.isBlock
                ? DecorationSet.create(tr.doc, [
                    Decoration.node(pos, pos + node.nodeSize, {
                      class: "editor-block-selection",
                    }),
                  ])
                : DecorationSet.empty;
            }

            return previous.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => blockMenuSelectionPluginKey.getState(state),
        },
      }),
      new Plugin<BlockSelectionPluginState>({
        key: blockSelectionPluginKey,
        state: {
          init: emptyPluginState,
          apply(tr, previous, _oldState, newState) {
            const meta = tr.getMeta(blockSelectionPluginKey) as BlockSelectionMeta | undefined;

            if (meta?.type === "select-all" || meta?.type === "select-range") {
              return {
                mode: meta.type === "select-all" ? "all" : "range",
                decorations: buildAllBlockDecorations(newState.doc, newState.selection),
              };
            }

            if (tr.selectionSet || meta?.type === "clear" || newState.selection.empty) {
              return emptyPluginState();
            }

            if (tr.docChanged && previous.mode !== "none") {
              return {
                ...previous,
                decorations: buildAllBlockDecorations(newState.doc, newState.selection),
              };
            }

            return previous;
          },
        },
        props: {
          decorations(state) {
            return blockSelectionPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
        view(view) {
          let blockSelectionActive = false;
          const marquee = createBlockMarquee(view, {
            getRanges: () =>
              getBlockSelectionRanges(view.state.doc, 0, view.state.doc.content.size),
            select(range) {
              const { state } = view;
              const selection = range
                ? new BlockRangeSelection(
                    state.doc.resolve(range.from),
                    state.doc.resolve(range.to),
                  )
                : TextSelection.near(state.selection.$anchor);
              view.dispatch(
                state.tr.setSelection(selection).setMeta(blockSelectionPluginKey, {
                  type: range ? "select-range" : "clear",
                } satisfies BlockSelectionMeta),
              );
            },
            captureSelection() {
              const { selection } = view.state;
              const mode = blockSelectionPluginKey.getState(view.state)?.mode ?? "none";
              return () =>
                view.dispatch(
                  view.state.tr.setSelection(selection).setMeta(blockSelectionPluginKey, {
                    type:
                      mode === "all" ? "select-all" : mode === "range" ? "select-range" : "clear",
                  } satisfies BlockSelectionMeta),
                );
            },
          });
          // ProseMirror renders native selection through Selection.visible.
          // Publishing block mode must not override that rendering on blur or
          // expose a different invisible selection, such as a database node.
          const notifyBlockSelectionChange = () => {
            const useBlockHighlight = isBlockSelectionActive(view.state);

            if (useBlockHighlight !== blockSelectionActive) {
              blockSelectionActive = useBlockHighlight;
              view.dom.dispatchEvent(
                new CustomEvent<boolean>("editor-block-selection-change", {
                  detail: useBlockHighlight,
                }),
              );
            }
          };

          notifyBlockSelectionChange();

          return {
            update() {
              marquee.update();
              notifyBlockSelectionChange();
            },
            destroy() {
              marquee.destroy();
            },
          };
        },
      }),
    ];
  },
});
