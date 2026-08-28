import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
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
  isSynchronized: () => boolean
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

let editorRegistryVersion = 0
const editorRegistryListeners = new Set<() => void>()

function emitEditorRegistryChange() {
  editorRegistryVersion += 1
  for (const listener of editorRegistryListeners) {
    listener()
  }
}

function subscribeEditorRegistry(listener: () => void) {
  editorRegistryListeners.add(listener)
  return () => {
    editorRegistryListeners.delete(listener)
  }
}

export function usePageEditorRegistryVersion() {
  return useSyncExternalStore(
    subscribeEditorRegistry,
    () => editorRegistryVersion,
    () => editorRegistryVersion,
  )
}

export function PageEditorRegistryProvider({
  children,
}: {
  children: ReactNode
}) {
  const editorsRef = useRef(new Map<string, PageEditorHandle>())

  const registerEditor = useCallback(
    (pageId: string, handle: PageEditorHandle) => {
      editorsRef.current.set(pageId, handle)
      emitEditorRegistryChange()
    },
    [],
  )

  const unregisterEditor = useCallback((pageId: string) => {
    editorsRef.current.delete(pageId)
    emitEditorRegistryChange()
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
