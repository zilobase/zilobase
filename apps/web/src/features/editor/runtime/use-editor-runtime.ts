import { useMemo, useRef } from "react"
import type { DatabaseBlockEditorRuntime } from "@/packages/editor/extensions/database"

export const useEditorRuntime = (editable: boolean) => {
  const editorRuntimeRef = useRef({
    editable,
    listeners: new Set<() => void>(),
  })

  const databaseEditorRuntime = useMemo<DatabaseBlockEditorRuntime>(
    () => ({
      getEditable: () => editorRuntimeRef.current.editable,
      subscribe: (listener) => {
        editorRuntimeRef.current.listeners.add(listener)
        return () => editorRuntimeRef.current.listeners.delete(listener)
      },
    }),
    []
  )

  return { databaseEditorRuntime, editorRuntimeRef }
}