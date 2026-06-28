import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react"

import type {
  PageEditPreviewClearOptions,
  PageEditPreviewRequest,
} from "@/editor/types"

export type PageEditorHandle = {
  acceptEditDiffPreview: () => boolean
  clearEditDiffPreview: (options?: PageEditPreviewClearOptions) => void
  getActiveEditDiffToolCallId: () => string | null
  getContentJson: () => unknown | null
  isEditDiffPreviewActive: () => boolean
  isEditable: () => boolean
  setContentFromMarkdown: (markdown: string) => boolean
  setContentJson: (content: unknown) => boolean
  showEditDiffPreview: (request: PageEditPreviewRequest) => boolean
}

export type { PageEditPreviewClearOptions, PageEditPreviewRequest }

type PageEditorRegistryValue = {
  getEditorHandle: (pageId: string) => PageEditorHandle | null
  registerEditor: (pageId: string, handle: PageEditorHandle) => void
  unregisterEditor: (pageId: string) => void
}

const PageEditorRegistryContext =
  createContext<PageEditorRegistryValue | null>(null)

export function PageEditorRegistryProvider({
  children,
}: {
  children: ReactNode
}) {
  const editorsRef = useRef(new Map<string, PageEditorHandle>())

  const registerEditor = useCallback(
    (pageId: string, handle: PageEditorHandle) => {
      editorsRef.current.set(pageId, handle)
    },
    [],
  )

  const unregisterEditor = useCallback((pageId: string) => {
    editorsRef.current.delete(pageId)
  }, [])

  const getEditorHandle = useCallback((pageId: string) => {
    return editorsRef.current.get(pageId) ?? null
  }, [])

  const value = useMemo(
    () => ({
      getEditorHandle,
      registerEditor,
      unregisterEditor,
    }),
    [getEditorHandle, registerEditor, unregisterEditor],
  )

  return (
    <PageEditorRegistryContext.Provider value={value}>
      {children}
    </PageEditorRegistryContext.Provider>
  )
}

export function usePageEditorRegistry() {
  const value = useContext(PageEditorRegistryContext)

  if (!value) {
    throw new Error(
      "usePageEditorRegistry must be used inside PageEditorRegistryProvider",
    )
  }

  return value
}