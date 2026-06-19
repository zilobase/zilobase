import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react"

type EditorContentGetter = () => unknown

type WorkspaceEditorRegistryValue = {
  getEditorContent: (workspaceId: string) => unknown | null
  registerEditor: (workspaceId: string, getter: EditorContentGetter) => void
  unregisterEditor: (workspaceId: string) => void
}

const WorkspaceEditorRegistryContext =
  createContext<WorkspaceEditorRegistryValue | null>(null)

export function WorkspaceEditorRegistryProvider({
  children,
}: {
  children: ReactNode
}) {
  const editorsRef = useRef(new Map<string, EditorContentGetter>())

  const registerEditor = useCallback(
    (workspaceId: string, getter: EditorContentGetter) => {
      editorsRef.current.set(workspaceId, getter)
    },
    [],
  )

  const unregisterEditor = useCallback((workspaceId: string) => {
    editorsRef.current.delete(workspaceId)
  }, [])

  const getEditorContent = useCallback((workspaceId: string) => {
    const getter = editorsRef.current.get(workspaceId)

    if (!getter) {
      return null
    }

    return getter()
  }, [])

  const value = useMemo(
    () => ({
      getEditorContent,
      registerEditor,
      unregisterEditor,
    }),
    [getEditorContent, registerEditor, unregisterEditor],
  )

  return (
    <WorkspaceEditorRegistryContext.Provider value={value}>
      {children}
    </WorkspaceEditorRegistryContext.Provider>
  )
}

export function useWorkspaceEditorRegistry() {
  const value = useContext(WorkspaceEditorRegistryContext)

  if (!value) {
    throw new Error(
      "useWorkspaceEditorRegistry must be used inside WorkspaceEditorRegistryProvider",
    )
  }

  return value
}