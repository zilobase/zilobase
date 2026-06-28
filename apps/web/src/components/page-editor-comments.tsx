"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type PageEditorCommentsContextValue = {
  editorCommentsOpenRequest: number
  requestEditorComments: () => void
}

const PageEditorCommentsContext =
  createContext<PageEditorCommentsContextValue | null>(null)

export function PageEditorCommentsProvider({
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
    <PageEditorCommentsContext.Provider value={value}>
      {children}
    </PageEditorCommentsContext.Provider>
  )
}

export function usePageEditorComments() {
  const context = useContext(PageEditorCommentsContext)

  if (!context) {
    throw new Error(
      "usePageEditorComments must be used within PageEditorCommentsProvider",
    )
  }

  return context
}

export function useOptionalPageEditorComments() {
  return useContext(PageEditorCommentsContext)
}