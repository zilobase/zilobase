"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type WorkspaceEditorCommentsContextValue = {
  editorCommentsOpenRequest: number
  requestEditorComments: () => void
}

const WorkspaceEditorCommentsContext =
  createContext<WorkspaceEditorCommentsContextValue | null>(null)

export function WorkspaceEditorCommentsProvider({
  children,
}: {
  children: ReactNode
}) {
  const [editorCommentsOpenRequest, setEditorCommentsOpenRequest] = useState(0)

  const requestEditorComments = useCallback(() => {
    setEditorCommentsOpenRequest((count) => count + 1)
  }, [])

  const value = useMemo(
    () => ({
      editorCommentsOpenRequest,
      requestEditorComments,
    }),
    [editorCommentsOpenRequest, requestEditorComments],
  )

  return (
    <WorkspaceEditorCommentsContext.Provider value={value}>
      {children}
    </WorkspaceEditorCommentsContext.Provider>
  )
}

export function useWorkspaceEditorComments() {
  const context = useContext(WorkspaceEditorCommentsContext)

  if (!context) {
    throw new Error(
      "useWorkspaceEditorComments must be used within WorkspaceEditorCommentsProvider",
    )
  }

  return context
}

export function useOptionalWorkspaceEditorComments() {
  return useContext(WorkspaceEditorCommentsContext)
}