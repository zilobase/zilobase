import type { Editor } from "@tiptap/core"
import { closeHistory } from "@tiptap/pm/history"
import type { Transaction } from "@tiptap/pm/state"

export type EditorHistoryDepths = {
  redo: number
  undo: number
}

export type EditorHistoryTransition = {
  count: number
  type: "push" | "redo" | "undo"
}

type HistoryPluginState = {
  done?: { eventCount?: number }
  undone?: { eventCount?: number }
  undoManager?: {
    redoStack?: unknown[]
    stopCapturing?: () => void
    undoStack?: unknown[]
  }
}

function getPluginKey(plugin: object) {
  return (plugin as { key: string }).key
}

export function getEditorHistoryDepths(editor: Editor): EditorHistoryDepths {
  for (const plugin of editor.state.plugins) {
    const state = plugin.getState(editor.state) as HistoryPluginState | undefined
    const pluginKey = getPluginKey(plugin)

    if (pluginKey.startsWith("y-undo$") && state?.undoManager) {
      return {
        redo: state.undoManager.redoStack?.length ?? 0,
        undo: state.undoManager.undoStack?.length ?? 0,
      }
    }

    if (pluginKey.startsWith("history$") && state) {
      return {
        redo: state.undone?.eventCount ?? 0,
        undo: state.done?.eventCount ?? 0,
      }
    }
  }

  return { redo: 0, undo: 0 }
}

export function getEditorHistoryTransition(
  previous: EditorHistoryDepths,
  next: EditorHistoryDepths,
  historyOperation: boolean,
): EditorHistoryTransition | null {
  if (historyOperation && next.undo < previous.undo) {
    return { count: previous.undo - next.undo, type: "undo" }
  }

  if (historyOperation && next.redo < previous.redo) {
    return { count: previous.redo - next.redo, type: "redo" }
  }

  if (!historyOperation && next.undo > previous.undo) {
    return { count: next.undo - previous.undo, type: "push" }
  }

  return null
}

export function isEditorHistoryOperation(
  editor: Editor,
  transaction: Transaction,
) {
  for (const plugin of editor.state.plugins) {
    const pluginKey = getPluginKey(plugin)
    const meta = transaction.getMeta(plugin) as
      | { isUndoRedoOperation?: boolean }
      | undefined

    if (pluginKey.startsWith("history$") && meta !== undefined) {
      return true
    }

    if (pluginKey.startsWith("y-sync$") && meta?.isUndoRedoOperation) {
      return true
    }
  }

  return false
}

export function closeEditorHistory(editor: Editor) {
  for (const plugin of editor.state.plugins) {
    const state = plugin.getState(editor.state) as HistoryPluginState | undefined
    const pluginKey = getPluginKey(plugin)

    if (pluginKey.startsWith("y-undo$") && state?.undoManager) {
      state.undoManager.stopCapturing?.()
      return
    }

    if (pluginKey.startsWith("history$")) {
      editor.view.dispatch(closeHistory(editor.state.tr))
      return
    }
  }
}
