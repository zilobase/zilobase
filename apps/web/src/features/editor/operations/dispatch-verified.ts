import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

/** Public lifecycle events include schema normalization appended by installed extensions. */
export function dispatchVerified(editor: Editor, transaction: Transaction) {
  let expected: Node | undefined;
  let applied = false;
  const prepare = ({
    transaction: current,
    nextState,
  }: {
    transaction: Transaction;
    nextState: EditorState;
  }) => {
    if (current === transaction) expected = nextState.doc;
  };
  const commit = ({ transaction: current }: { transaction: Transaction }) => {
    if (current === transaction) applied = true;
  };
  editor.on("beforeTransaction", prepare);
  editor.on("transaction", commit);
  try {
    editor.view.dispatch(transaction);
  } finally {
    editor.off("beforeTransaction", prepare);
    editor.off("transaction", commit);
  }
  return {
    applied: applied && !!expected && !editor.isDestroyed && editor.state.doc.eq(expected),
    expected,
  };
}
