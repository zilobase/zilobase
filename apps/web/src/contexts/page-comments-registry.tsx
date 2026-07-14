import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import type { PageCommentController } from "@/comments/yjs-comments"

type Registry = {
  get: (pageId: string) => PageCommentController | null
  register: (pageId: string, controller: PageCommentController) => () => void
  subscribe: (pageId: string, listener: () => void) => () => void
}

const PageCommentsRegistryContext = createContext<Registry | null>(null)

export function PageCommentsRegistryProvider({ children }: { children: ReactNode }) {
  const controllers = useRef(new Map<string, PageCommentController>())
  const listeners = useRef(new Map<string, Set<() => void>>())

  const notify = useCallback((pageId: string) => {
    listeners.current.get(pageId)?.forEach((listener) => listener())
  }, [])
  const get = useCallback((pageId: string) => controllers.current.get(pageId) ?? null, [])
  const register = useCallback((pageId: string, controller: PageCommentController) => {
    controllers.current.set(pageId, controller)
    notify(pageId)
    return () => {
      if (controllers.current.get(pageId) === controller) {
        controllers.current.delete(pageId)
        notify(pageId)
      }
    }
  }, [notify])
  const subscribe = useCallback((pageId: string, listener: () => void) => {
    const pageListeners = listeners.current.get(pageId) ?? new Set()
    pageListeners.add(listener)
    listeners.current.set(pageId, pageListeners)
    return () => {
      pageListeners.delete(listener)
      if (pageListeners.size === 0) listeners.current.delete(pageId)
    }
  }, [])
  const value = useMemo(() => ({ get, register, subscribe }), [get, register, subscribe])

  return <PageCommentsRegistryContext.Provider value={value}>{children}</PageCommentsRegistryContext.Provider>
}

export function usePageCommentsRegistry() {
  const registry = useContext(PageCommentsRegistryContext)
  if (!registry) throw new Error("PageCommentsRegistryProvider is missing")
  return registry
}

export function usePageCommentController(pageId?: string | null) {
  const registry = usePageCommentsRegistry()
  return useSyncExternalStore(
    useCallback((listener) => pageId ? registry.subscribe(pageId, listener) : () => undefined, [pageId, registry]),
    useCallback(() => pageId ? registry.get(pageId) : null, [pageId, registry]),
    () => null,
  )
}

export function usePageCommentsSnapshot(pageId?: string | null) {
  const controller = usePageCommentController(pageId)
  return useSyncExternalStore(
    useCallback((listener) => controller?.subscribe(listener) ?? (() => undefined), [controller]),
    useCallback(() => controller?.getSnapshot() ?? EMPTY_SNAPSHOT, [controller]),
    () => EMPTY_SNAPSHOT,
  )
}

const EMPTY_SNAPSHOT = { activeThreadId: null, threads: [] } as const
