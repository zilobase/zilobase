import type { Editor, MappablePosition } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";

/** Keep block boundaries attached to their content, rather than Yjs's sticky document start. */
export function createPositionAnchor(
  editor: Editor,
  pos: number,
  side: "left" | "right" = "right",
) {
  const $pos = editor.state.doc.resolve(pos);
  const node = side === "right" ? $pos.nodeAfter : $pos.nodeBefore;
  const offset =
    !$pos.parent.inlineContent && node && node.nodeSize > 1 ? (side === "right" ? -1 : 1) : 0;
  let position: MappablePosition = editor.utils.createMappablePosition(pos - offset);
  let deleted = false;
  const update = ({
    transaction,
    appendedTransactions = [],
  }: {
    transaction: Transaction;
    appendedTransactions?: Transaction[];
  }) => {
    if (deleted) return;
    try {
      for (const current of [transaction, ...appendedTransactions]) {
        const next = editor.utils.getUpdatedPosition(position, current);
        position = next.position;
        deleted ||= Boolean(next.mapResult?.deleted);
      }
    } catch {
      deleted = true;
    }
  };
  editor.on("transaction", update);
  return {
    resolve: () => (deleted || editor.isDestroyed ? null : position.position + offset),
    dispose: () => editor.off("transaction", update),
  };
}
export type PositionAnchor = ReturnType<typeof createPositionAnchor>;

/** Temporary Yjs type identity detects deleted/replaced atoms without persisted block IDs. */
export function captureSourceIdentity(editor: Editor, ranges: Array<{ from: number; to: number }>) {
  const root = ySyncPluginKey.getState(editor.state)?.type as Y.XmlFragment | undefined;
  if (!root) return () => true;
  const types = ranges.map(({ from }) => {
    const $pos = editor.state.doc.resolve(from);
    let type: Y.XmlFragment | Y.XmlElement | Y.XmlText = root;
    for (let depth = 0; depth <= $pos.depth; depth++) {
      if (!(type instanceof Y.XmlFragment)) return null;
      type = type.get($pos.index(depth));
      if (!type) return null;
    }
    return type;
  });
  return () =>
    types.every((type) => {
      if (!type) return false;
      let current: Y.XmlFragment | Y.XmlElement | Y.XmlText = type;
      while (current !== root) {
        const parent: Y.AbstractType<unknown> | null = current.parent;
        if (
          !(parent instanceof Y.XmlFragment) ||
          !parent.toArray().includes(current as Y.XmlElement | Y.XmlText)
        )
          return false;
        current = parent;
      }
      return true;
    });
}
