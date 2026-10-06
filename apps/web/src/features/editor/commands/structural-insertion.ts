import type { Editor } from "@tiptap/core";
import { createPositionAnchor } from "../operations/position-anchor";
export type StructuralInsertionPendingChange = (pending: boolean) => void;

export async function runStructuralInsertion<T>({
  create,
  insert,
  onPendingChange,
}: {
  create: (() => Promise<T | null>) | undefined;
  insert: (created: T) => void;
  onPendingChange?: StructuralInsertionPendingChange;
}) {
  if (!create) {
    return null;
  }

  onPendingChange?.(true);

  try {
    const created = await create();

    if (created !== null) {
      insert(created);
    }

    return created;
  } finally {
    onPendingChange?.(false);
  }
}

export async function insertCreatedBlock<T>({
  editor,
  range,
  create,
  content,
  onPendingChange,
}: {
  editor: Editor;
  range: { from: number; to: number };
  create: (() => Promise<T | null>) | undefined;
  content: (created: T) => import("@tiptap/core").Content;
  onPendingChange?: StructuralInsertionPendingChange;
}) {
  const from = createPositionAnchor(editor, range.from),
    to = createPositionAnchor(editor, range.to);
  const expected = editor.state.doc.slice(range.from, range.to);
  try {
    return await runStructuralInsertion({
      create,
      onPendingChange,
      insert: (created) => {
        const start = from.resolve(),
          end = to.resolve();
        if (
          editor.isDestroyed ||
          !editor.isEditable ||
          start === null ||
          end === null ||
          end < start
        )
          return;
        if (!editor.state.doc.slice(start, end).eq(expected)) return;
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .replaceBlocksRange({ from: start, to: end }, content(created))
          .run();
      },
    });
  } finally {
    from.dispose();
    to.dispose();
  }
}
