import type { Editor } from "@tiptap/core";
import { closeHistory, isHistoryTransaction, redoDepth, undoDepth } from "@tiptap/pm/history";
import type { Transaction } from "@tiptap/pm/state";
import { ySyncPluginKey, yUndoPluginKey } from "@tiptap/y-tiptap";
import type { UndoManager } from "yjs";
export type EditorHistoryDepths = { redo: number; undo: number };
export type EditorHistoryTransition = { count: number; type: "push" | "redo" | "undo" };
export function getEditorUndoManager(editor: Editor): UndoManager | null {
  return yUndoPluginKey.getState(editor.state)?.undoManager ?? null;
}
export function getEditorHistoryDepths(editor: Editor): EditorHistoryDepths {
  const manager = getEditorUndoManager(editor);
  return manager
    ? { redo: manager.redoStack.length, undo: manager.undoStack.length }
    : { redo: redoDepth(editor.state), undo: undoDepth(editor.state) };
}
export function getEditorHistoryTransition(
  previous: EditorHistoryDepths,
  next: EditorHistoryDepths,
  historyOperation: boolean,
): EditorHistoryTransition | null {
  if (historyOperation && next.undo < previous.undo)
    return { count: previous.undo - next.undo, type: "undo" };
  if (historyOperation && next.redo < previous.redo)
    return { count: previous.redo - next.redo, type: "redo" };
  if (!historyOperation && next.undo > previous.undo)
    return { count: next.undo - previous.undo, type: "push" };
  return null;
}
export function isEditorHistoryOperation(_editor: Editor, transaction: Transaction) {
  return (
    isHistoryTransaction(transaction) ||
    Boolean(transaction.getMeta(ySyncPluginKey)?.isUndoRedoOperation)
  );
}
export function closeEditorHistory(editor: Editor) {
  const manager = getEditorUndoManager(editor);
  if (manager) manager.stopCapturing();
  else editor.view.dispatch(closeHistory(editor.state.tr));
}
