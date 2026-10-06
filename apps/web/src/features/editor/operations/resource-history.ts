import type { EditorResourceReceipt } from "../core/types";

type ResourceEditorHistory = {
  canUndo: () => boolean;
  canRedo: () => boolean;
  redo: () => boolean;
  undo: () => boolean;
};

export function createResourceHistoryAction({
  editor,
  onError,
  resource,
  label,
}: {
  editor: ResourceEditorHistory;
  onError: (error: unknown) => void;
  resource: EditorResourceReceipt;
  label: string;
}) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = (direction: "undo" | "redo") => {
    const operation = queue.then(async () => {
      const allowed = direction === "undo" ? editor.canUndo : editor.canRedo;
      if (!allowed()) return false;
      try {
        await resource[direction]();
        // Typing, remote changes or pane closure may have invalidated the receipt while waiting.
        if (!allowed() || !editor[direction]()) {
          await resource[direction === "undo" ? "redo" : "undo"]();
          return false;
        }
        return true;
      } catch (error) {
        onError(error);
        return false;
      }
    });
    queue = operation;
    return operation;
  };
  return { label, undo: () => run("undo"), redo: () => run("redo") };
}
