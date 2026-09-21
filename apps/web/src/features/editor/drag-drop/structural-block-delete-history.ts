import type { StructuralBlockDeleteHistory } from "../core/types"

type StructuralBlockEditorHistory = {
  redo: () => boolean | void
  undo: () => boolean | void
}

export function createStructuralBlockDeleteHistoryAction({
  editor,
  onError,
  resource,
}: {
  editor: StructuralBlockEditorHistory
  onError: (error: unknown) => void
  resource: StructuralBlockDeleteHistory
}) {
  let resourceTransition = Promise.resolve()

  const enqueueResourceTransition = (transition: () => Promise<void>) => {
    resourceTransition = resourceTransition.then(transition).catch(onError)
  }

  return {
    label: "Delete structural block",
    redo: () => {
      const changed = editor.redo()
      if (changed === false) return false
      enqueueResourceTransition(resource.redo)
      return changed
    },
    undo: () => {
      const changed = editor.undo()
      if (changed === false) return false
      enqueueResourceTransition(resource.undo)
      return changed
    },
  }
}
