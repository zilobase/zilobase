import { createResourceHistoryAction } from "../operations/resource-history";
import type { Editor } from "@tiptap/core";
import {
  closeEditorHistory,
  getEditorHistoryDepths,
  getEditorHistoryTransition,
  getEditorUndoManager,
  isEditorHistoryOperation,
} from "@/shared/shortcuts/editor-history";

type HistoryAction = {
  label: string;
  operationId?: string;
  canUndo?: () => boolean;
  canRedo?: () => boolean;
  participants: Editor[];
  undo: () => boolean | void | Promise<boolean | void>;
  redo: () => boolean | void | Promise<boolean | void>;
};
const LIMIT = 100;
/** A chronological ledger delegates text changes to each view's native history. */
export function createEditorHistoryCoordinator() {
  const undo: HistoryAction[] = [];
  const redo: HistoryAction[] = [];
  const editors = new Set<Editor>();
  const registrations = new Map<Editor, { references: number; cleanup: () => void }>();
  let suppression = 0;
  let pending = false;
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const valid = (action: HistoryAction) =>
    action.participants.every((editor) => editors.has(editor) && !editor.isDestroyed);
  const push = (action: HistoryAction) => {
    if (suppression) return;
    undo.push(action);
    if (undo.length > LIMIT) undo.shift();
    redo.length = 0;
    publish();
  };
  const suppress = <T>(callback: () => T): T => {
    suppression++;
    try {
      return callback();
    } finally {
      suppression--;
    }
  };
  const capture = (editor: Editor) => {
    const manager = getEditorUndoManager(editor);
    let undoItem = manager?.undoStack.at(-1);
    let redoItem: unknown;
    let undoDepth = getEditorHistoryDepths(editor).undo;
    let redoDepth = 0;
    const canUndo = () =>
      !editor.isDestroyed &&
      (manager
        ? manager.undoStack.at(-1) === undoItem && !!undoItem
        : getEditorHistoryDepths(editor).undo === undoDepth && undoDepth > 0);
    const canRedo = () =>
      !editor.isDestroyed &&
      (manager
        ? manager.redoStack.at(-1) === redoItem && !!redoItem
        : getEditorHistoryDepths(editor).redo === redoDepth && redoDepth > 0);
    return {
      canUndo,
      canRedo,
      undo() {
        if (!canUndo()) return false;
        const changed = suppress(() => editor.commands.undo());
        if (changed) {
          redoItem = manager?.redoStack.at(-1);
          redoDepth = getEditorHistoryDepths(editor).redo;
        }
        return changed;
      },
      redo() {
        if (!canRedo()) return false;
        const changed = suppress(() => editor.commands.redo());
        if (changed) {
          undoItem = manager?.undoStack.at(-1);
          undoDepth = getEditorHistoryDepths(editor).undo;
        }
        return changed;
      },
    };
  };
  const run = (direction: "undo" | "redo") => {
    if (pending) return true;
    const source = direction === "undo" ? undo : redo;
    const destination = direction === "undo" ? redo : undo;
    while (source.length && !valid(source[source.length - 1])) source.pop();
    const action = source[source.length - 1];
    if (!action) return false;
    pending = true;
    suppression++;
    const finish = (changed: boolean | void) => {
      pending = false;
      const index = source.lastIndexOf(action);
      if (changed !== false && index !== -1) {
        source.splice(index, 1);
        destination.push(action);
      }
      publish();
    };
    try {
      const result = suppress(() => action[direction]());
      suppression--;
      if (result instanceof Promise) void result.then(finish, () => finish(false));
      else finish(result);
    } catch {
      suppression--;
      finish(false);
    }
    return true;
  };
  return {
    push,
    suppress,
    capture,
    attachResource(
      operationId: string,
      resource: import("../core/types").EditorResourceReceipt,
      onError: (error: unknown) => void,
    ) {
      const action = [...undo].reverse().find((entry) => entry.operationId === operationId);
      if (!action || !action.canUndo || !action.canRedo) return false;
      const wrapped = createResourceHistoryAction({
        label: action.label,
        resource,
        onError,
        editor: {
          canUndo: action.canUndo,
          canRedo: action.canRedo,
          undo: action.undo as () => boolean,
          redo: action.redo as () => boolean,
        },
      });
      action.undo = wrapped.undo;
      action.redo = wrapped.redo;
      return true;
    },
    undo: () => run("undo"),
    redo: () => run("redo"),
    get pending() {
      return pending;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    register(editor: Editor) {
      const release = () => {
        let released = false;
        return () => {
          if (released) return;
          released = true;
          const current = registrations.get(editor);
          if (current && --current.references === 0) {
            registrations.delete(editor);
            current.cleanup();
          }
        };
      };
      const current = registrations.get(editor);
      if (current) {
        current.references++;
        return release();
      }
      editors.add(editor);
      let depths = getEditorHistoryDepths(editor);
      const record = () => {
        if (suppression) return;
        for (const other of editors) if (other !== editor) closeEditorHistory(other);
        push({ label: "Edit page", participants: [editor], ...capture(editor) });
      };
      const manager = getEditorUndoManager(editor);
      const stackAdded = ({ type }: { type: string }) => {
        if (type === "undo") record();
      };
      const transaction = ({
        transaction: tr,
      }: {
        transaction: import("@tiptap/pm/state").Transaction;
      }) => {
        if (manager) return;
        const next = getEditorHistoryDepths(editor);
        const transition = getEditorHistoryTransition(
          depths,
          next,
          isEditorHistoryOperation(editor, tr),
        );
        depths = next;
        if (transition?.type === "push") for (let i = 0; i < transition.count; i++) record();
      };
      manager?.on("stack-item-added", stackAdded);
      editor.on("transaction", transaction);
      registrations.set(editor, {
        references: 1,
        cleanup: () => {
          manager?.off("stack-item-added", stackAdded);
          editor.off("transaction", transaction);
          editors.delete(editor);
          for (const stack of [undo, redo])
            for (let i = stack.length - 1; i >= 0; i--)
              if (stack[i].participants.includes(editor)) stack.splice(i, 1);
          publish();
        },
      });
      return release();
    },
    group<T>(participants: Editor[], label: string, commit: () => T, operationId?: string): T {
      for (const editor of participants) closeEditorHistory(editor);
      const before = participants.map((editor) => getEditorHistoryDepths(editor));
      const result = suppress(commit);
      const receipts = participants
        .map((editor, index) => ({
          editor,
          changed: getEditorHistoryDepths(editor).undo > before[index].undo,
          ...capture(editor),
        }))
        .filter((receipt) => receipt.changed);
      for (const editor of participants) closeEditorHistory(editor);
      if (receipts.length)
        push({
          label,
          operationId,
          canUndo: () => receipts.every((r) => r.canUndo()),
          canRedo: () => receipts.every((r) => r.canRedo()),
          participants: receipts.map((receipt) => receipt.editor),
          undo: () => {
            if (!receipts.every((r) => r.canUndo())) return false;
            const applied: typeof receipts = [];
            for (const r of [...receipts].reverse()) {
              if (!r.undo()) {
                for (const previous of applied.reverse()) previous.redo();
                return false;
              }
              applied.push(r);
            }
            return true;
          },
          redo: () => {
            if (!receipts.every((r) => r.canRedo())) return false;
            const applied: typeof receipts = [];
            for (const r of receipts) {
              if (!r.redo()) {
                for (const previous of applied.reverse()) previous.undo();
                return false;
              }
              applied.push(r);
            }
            return true;
          },
        });
      return result;
    },
  };
}
