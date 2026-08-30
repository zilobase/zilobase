import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
  type ReactNode,
} from "react"
import { useLocation, useRouter } from "@tanstack/react-router"

import { cn } from "@/shared/lib/utils"
import { isMobileViewport, useIsMobile } from "@/shared/hooks/use-mobile"
import type { EmbeddedItemsOpenAs } from "@zilobase/features/pages"

export type OpenPageSidePaneOptions = {
  databaseId?: string | null
}

export type PageSidePaneContextValue = {
  closeEmbeddedPageDialog: () => void
  closeSidePane: () => void
  dialogDatabaseId: string | null
  dialogPageId: string | null
  embeddedItemsOpenAs: EmbeddedItemsOpenAs
  mainPaneNavigationActive: boolean
  openEmbeddedPageDialog: (
    pageId: string,
    options?: OpenPageSidePaneOptions,
  ) => void
  openDatabaseSidePane: (databaseId: string) => void
  openDatabaseInMainPane: (databaseId: string) => void
  openPageInMainPane: (
    pageId: string,
    options?: OpenPageSidePaneOptions,
  ) => void
  openSidePaneAsFullPage: () => void
  openSidePane: (
    pageId: string,
    options?: OpenPageSidePaneOptions,
  ) => void
  renderedSidePaneDatabaseId: string | null
  renderedSidePanePageId: string | null
  sidePaneAnimatedOpen: boolean
  sidePaneContentReady: boolean
  sidePaneDatabaseId: string | null
  sidePanePageId: string | null
}

export const PageSidePaneContext =
  createContext<PageSidePaneContextValue | null>(null)

export const WORKSPACE_SIDE_PANE_TRANSITION_MS = 200

const SIDE_PANE_DEFAULT_WIDTH = "clamp(22rem, 50%, 48rem)"
const SIDE_PANE_MIN_WIDTH = 320
const SIDE_PANE_MIN_MAIN_WIDTH = 256
const SIDE_PANE_READABLE_MIN_WIDTH = 352
const SIDE_PANE_KEYBOARD_RESIZE_STEP = 24

const SIDE_PANE_PAGE_PARAM = "p"
const SIDE_PANE_DATABASE_PARAM = "d"

export const getFullPagePath = (pageId: string) =>
  `/p/${encodeURIComponent(pageId)}`

export const getFullDatabasePath = (databaseId: string) =>
  `/d/${encodeURIComponent(databaseId)}`

let promotedFullPagePath: string | null = null
const promotedFullPageListeners = new Set<() => void>()

function setPromotedFullPagePath(path: string | null) {
  if (promotedFullPagePath === path) return
  promotedFullPagePath = path
  for (const listener of promotedFullPageListeners) listener()
}

export function clearPromotedFullPagePath() {
  setPromotedFullPagePath(null)
  document
    .querySelectorAll<HTMLElement>("[data-page-side-pane-shell]")
    .forEach((shell) => {
      delete shell.dataset.pageSidePanePromoted
      shell.style.setProperty(
        "--page-side-pane-width",
        SIDE_PANE_DEFAULT_WIDTH,
      )
    })
}

export function usePromotedFullPagePath() {
  return useSyncExternalStore(
    (listener) => {
      promotedFullPageListeners.add(listener)
      return () => promotedFullPageListeners.delete(listener)
    },
    () => promotedFullPagePath,
    () => null,
  )
}

export const pageSidePaneGridShellClass =
  "grid min-h-0 flex-1 overflow-hidden [grid-template-rows:3rem_minmax(0,1fr)]"

export const pageSidePaneMobilePanelTransitionClass =
  "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"

export function getPageSidePaneGridStyle(
  _visible: boolean,
  _open: boolean,
): CSSProperties {
  return {
    "--page-side-pane-width": SIDE_PANE_DEFAULT_WIDTH,
    gridTemplateColumns: "minmax(0, 1fr)",
  } as CSSProperties
}

export function getPageSidePaneMobilePanelClassName(open: boolean) {
  return cn(
    "max-md:w-full max-md:border-l-0",
    pageSidePaneMobilePanelTransitionClass,
    open
      ? "[transform:translate3d(0,0,0)]"
      : "pointer-events-none [transform:translate3d(100%,0,0)]",
  )
}

export function PageSidePaneShell({
  body,
  className,
  header,
  open,
  visible,
}: {
  body: ReactNode
  className?: string
  header?: ReactNode
  open: boolean
  visible: boolean
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open) return

    const timer = window.setTimeout(() => {
      shellRef.current?.style.setProperty(
        "--page-side-pane-width",
        SIDE_PANE_DEFAULT_WIDTH,
      )
    }, WORKSPACE_SIDE_PANE_TRANSITION_MS)

    return () => window.clearTimeout(timer)
  }, [open])

  return (
    <div
      className={cn(
        "relative isolate max-md:[grid-template-columns:minmax(0,1fr)!important]",
        header
          ? pageSidePaneGridShellClass
          : "grid min-h-0 flex-1 overflow-hidden [grid-template-rows:minmax(0,1fr)]",
        className,
      )}
      data-page-side-pane-open={open ? "true" : "false"}
      data-page-side-pane-shell
      ref={shellRef}
      style={getPageSidePaneGridStyle(visible, open)}
    >
      {header ? (
        <header className="relative col-span-full h-12 overflow-hidden">
          {header}
        </header>
      ) : null}
      <div
        className={cn(
          "relative col-span-full min-h-0 overflow-hidden",
          header ? "row-start-2" : "row-start-1",
        )}
      >
        {body}
      </div>
    </div>
  )
}

export function getPageSidePaneHeaderCellClassName({
  className,
  side,
  splitActive,
}: {
  className?: string
  side: "main" | "side"
  splitActive: boolean
}) {
  return cn(
    "flex h-12 min-h-0 min-w-0 items-center overflow-hidden",
    side === "main" && "h-full w-full bg-surface-canvas",
    side === "side" && [
      "absolute inset-y-0 right-0 z-30 w-[var(--page-side-pane-width)] bg-surface-canvas shadow-none dark:bg-surface-navigation",
      "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
      splitActive
        ? "border-l border-stroke-default [transform:translate3d(0,0,0)]"
        : "pointer-events-none [transform:translate3d(100%,0,0)]",
    ],
    className,
  )
}

export function PageSidePaneHeaderCell({
  children,
  className,
  splitActive = false,
  side = "main",
}: {
  children: ReactNode
  className?: string
  splitActive?: boolean
  side?: "main" | "side"
}) {
  return (
    <div
      className={getPageSidePaneHeaderCellClassName({
        className,
        side,
        splitActive,
      })}
      data-page-side-pane-main-header={side === "main" ? "" : undefined}
      data-page-side-pane-side-header={side === "side" ? "" : undefined}
    >
      {children}
    </div>
  )
}

export function PageSidePaneMainCell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="h-full min-h-0 w-full min-w-0" data-page-side-pane-main>
      <PageScrollViewport className="h-full" scrollClassName={className}>
        <div
          className="flex min-h-full w-full min-w-0 flex-col"
          data-page-side-pane-main-content
        >
          {children}
        </div>
      </PageScrollViewport>
    </div>
  )
}

export function PageScrollViewport({
  children,
  className,
  edgeFadeClassName,
  scrollClassName,
}: {
  children: ReactNode
  className?: string
  edgeFadeClassName?: string
  scrollClassName?: string
}) {
  return (
    <div
      className={cn(
        "relative min-h-0 min-w-0 overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-col overflow-y-auto [scrollbar-gutter:stable]",
          scrollClassName,
        )}
        data-page-scroll-viewport
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-20 h-5 bg-gradient-to-t from-surface-canvas to-transparent",
          edgeFadeClassName,
        )}
      />
    </div>
  )
}

export function PageSidePaneSideCell({
  children,
  className,
  open,
  show,
}: {
  children?: ReactNode
  className?: string
  open: boolean
  show?: boolean
}) {
  const panelRef = useRef<HTMLElement | null>(null)
  const pointerCleanupRef = useRef<() => void>(() => {})
  const promotionTimerRef = useRef<number | null>(null)
  const promotionPendingRef = useRef(false)
  const sidePaneContext = useContext(PageSidePaneContext)

  useEffect(
    () => () => {
      pointerCleanupRef.current()
      if (promotionTimerRef.current !== null) {
        window.clearTimeout(promotionTimerRef.current)
      }
    },
    [],
  )

  if (!show) {
    return null
  }

  const setPanelWidth = (width: number) => {
    const panel = panelRef.current
    const shell = panel?.closest<HTMLElement>("[data-page-side-pane-shell]")
    if (!panel || !shell) return null

    const shellWidth = shell.getBoundingClientRect().width
    const maxWidth = Math.max(
      SIDE_PANE_MIN_WIDTH,
      shellWidth - SIDE_PANE_MIN_MAIN_WIDTH,
    )
    const nextWidth = Math.min(Math.max(width, SIDE_PANE_MIN_WIDTH), maxWidth)
    shell.style.setProperty("--page-side-pane-width", `${nextWidth}px`)

    return {
      mainWidth: shellWidth - nextWidth,
      sideWidth: nextWidth,
    }
  }

  const promoteSidePaneToFullPage = () => {
    if (!sidePaneContext || promotionPendingRef.current) return

    const panel = panelRef.current
    const shell = panel?.closest<HTMLElement>("[data-page-side-pane-shell]")
    if (!panel || !shell) {
      sidePaneContext.openSidePaneAsFullPage()
      return
    }

    promotionPendingRef.current = true
    shell.dataset.pageSidePanePromoting = "true"
    shell.style.setProperty(
      "--page-side-pane-width",
      `${shell.getBoundingClientRect().width}px`,
    )

    promotionTimerRef.current = window.setTimeout(() => {
      promotionTimerRef.current = null
      delete shell.dataset.pageSidePanePromoting
      shell.dataset.pageSidePanePromoted = "true"
      promotionPendingRef.current = false
      sidePaneContext.openSidePaneAsFullPage()
    }, WORKSPACE_SIDE_PANE_TRANSITION_MS)
  }

  const expandUnreadablePane = (
    layout: { mainWidth: number; sideWidth: number },
    resizedSide: "main" | "side",
  ) => {
    if (!open || !sidePaneContext) return false

    const mainIsUnreadable = layout.mainWidth < SIDE_PANE_READABLE_MIN_WIDTH
    const sideIsUnreadable = layout.sideWidth < SIDE_PANE_READABLE_MIN_WIDTH

    if (!mainIsUnreadable && !sideIsUnreadable) return false

    if (mainIsUnreadable && sideIsUnreadable) {
      if (resizedSide === "side") {
        sidePaneContext.closeSidePane()
      } else {
        promoteSidePaneToFullPage()
      }
      return true
    }

    if (sideIsUnreadable) {
      sidePaneContext.closeSidePane()
      return true
    }

    promoteSidePaneToFullPage()
    return true
  }

  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return

    const panel = panelRef.current
    const shell = panel?.closest<HTMLElement>("[data-page-side-pane-shell]")
    if (!panel || !shell) return

    event.preventDefault()
    pointerCleanupRef.current()
    shell.dataset.pageSidePaneResizing = "true"
    const startPanelWidth = panel.getBoundingClientRect().width
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
      delete shell.dataset.pageSidePaneResizing
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      pointerCleanupRef.current = () => {}
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const shellRect = shell.getBoundingClientRect()
      const layout = setPanelWidth(shellRect.right - moveEvent.clientX)
      if (!layout) return

      const resizedSide = layout.sideWidth < startPanelWidth ? "side" : "main"
      const crossedReadableLimit =
        layout.mainWidth < SIDE_PANE_READABLE_MIN_WIDTH ||
        layout.sideWidth < SIDE_PANE_READABLE_MIN_WIDTH

      if (!crossedReadableLimit) return

      cleanup()
      window.requestAnimationFrame(() => {
        expandUnreadablePane(layout, resizedSide)
      })
    }

    const handlePointerUp = cleanup
    const handlePointerCancel = cleanup

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
    pointerCleanupRef.current = handlePointerCancel
  }

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const panel = panelRef.current
    if (!panel || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
      return
    }

    event.preventDefault()
    const direction = event.key === "ArrowLeft" ? 1 : -1
    const layout = setPanelWidth(
      panel.getBoundingClientRect().width +
        direction * SIDE_PANE_KEYBOARD_RESIZE_STEP,
    )
    if (layout) {
      expandUnreadablePane(layout, event.key === "ArrowRight" ? "side" : "main")
    }
  }

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "absolute inset-y-0 right-0 z-30 flex min-h-0 w-[var(--page-side-pane-width)] min-w-0 flex-col overflow-hidden border-l border-stroke-default bg-surface-canvas shadow-none dark:bg-surface-navigation",
        getPageSidePaneMobilePanelClassName(open),
        className,
      )}
      data-page-side-pane-panel
      inert={open ? undefined : true}
      ref={panelRef}
    >
      <div
        aria-label="Resize side pane"
        aria-orientation="vertical"
        className="group absolute inset-y-0 -left-1 z-40 hidden w-2 cursor-col-resize touch-none md:block"
        data-page-side-pane-resize-handle
        onKeyDown={handleResizeKeyDown}
        onPointerDown={handleResizePointerDown}
        role="separator"
        tabIndex={open ? 0 : -1}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-focus-visible:bg-action-focus-ring group-hover:bg-stroke-default" />
      </div>
      <PageScrollViewport
        className="h-full w-full"
        edgeFadeClassName="dark:from-surface-navigation"
      >
        {children}
      </PageScrollViewport>
    </aside>
  )
}

export function PageSidePaneLayout({
  className,
  main,
  mainScrollClassName,
  sidePane,
  sidePaneClassName,
  sidePaneOpen,
  sidePaneVisible,
  standalone = false,
  viewportHeightClass = "h-[calc(100svh-3rem)]",
}: {
  className?: string
  main: ReactNode
  mainScrollClassName?: string
  sidePane: ReactNode | null
  sidePaneClassName?: string
  sidePaneOpen: boolean
  sidePaneVisible: boolean
  standalone?: boolean
  viewportHeightClass?: string
}) {
  const split = (
    <>
      <PageSidePaneMainCell
        className={cn(!standalone && "min-h-0", mainScrollClassName)}
      >
        {main}
      </PageSidePaneMainCell>
      <PageSidePaneSideCell
        className={sidePaneClassName}
        open={sidePaneOpen}
        show={sidePaneVisible}
      >
        {sidePane}
      </PageSidePaneSideCell>
    </>
  )

  if (!standalone) {
    return split
  }

  return (
    <PageSidePaneShell
      body={split}
      className={cn(viewportHeightClass, className)}
      open={sidePaneOpen}
      visible={sidePaneVisible}
    />
  )
}

export function usePageSidePaneState(
  _resetKey?: string | null,
  embeddedItemsOpenAs: EmbeddedItemsOpenAs = "sidepanel",
): PageSidePaneContextValue {
  const router = useRouter()
  const isMobile = useIsMobile()
  const promotedFullPagePath = usePromotedFullPagePath()
  const location = useLocation({
    select: ({ hash, pathname, searchStr }) => ({
      hash,
      pathname,
      searchStr,
    }),
  })
  const sidePanePageId = getSearchParam(
    location.searchStr,
    SIDE_PANE_PAGE_PARAM,
  )
  const sidePaneDatabaseId = getSearchParam(
    location.searchStr,
    SIDE_PANE_DATABASE_PARAM,
  )
  const [dialogPageId, setDialogPageId] = useState<string | null>(
    null,
  )
  const [dialogDatabaseId, setDialogDatabaseId] = useState<string | null>(null)
  const [renderedSidePanePageId, setRenderedSidePanePageId] =
    useState<string | null>(null)
  const [renderedSidePaneDatabaseId, setRenderedSidePaneDatabaseId] =
    useState<string | null>(null)
  const [sidePaneAnimatedOpen, setSidePaneAnimatedOpen] = useState(false)
  const [sidePaneContentReady, setSidePaneContentReady] = useState(false)
  const sidePaneWasOpenRef = useRef(false)
  const pendingMainPanePathRef = useRef<string | null>(null)
  const writeSidePaneParams = useCallback(
    (pageId: string | null, databaseId?: string | null, replace = false) => {
      const params = new URLSearchParams(location.searchStr)
      const databaseParam = getSidePaneDatabaseParam(
        location.pathname,
        databaseId,
      )

      if (pageId) {
        params.set(SIDE_PANE_PAGE_PARAM, pageId)
      } else {
        params.delete(SIDE_PANE_PAGE_PARAM)
      }

      if (databaseParam) {
        params.set(SIDE_PANE_DATABASE_PARAM, databaseParam)
      } else {
        params.delete(SIDE_PANE_DATABASE_PARAM)
      }

      const search = params.toString()
      const hash = location.hash ? `#${location.hash}` : ""
      const path = `${location.pathname}${search ? `?${search}` : ""}${hash}`

      if (path === `${location.pathname}${location.searchStr}${hash}`) {
        return
      }

      if (replace) {
        router.history.replace(path)
        return
      }

      router.history.push(path)
    },
    [location.hash, location.pathname, location.searchStr, router.history],
  )
  const closeSidePane = useCallback(() => {
    clearPromotedFullPagePath()
    writeSidePaneParams(null, null, true)
  }, [writeSidePaneParams])
  const closeEmbeddedPageDialog = useCallback(() => {
    setDialogPageId(null)
    setDialogDatabaseId(null)
  }, [])
  const openSidePane = useCallback(
    (nextPageId: string, options?: OpenPageSidePaneOptions) => {
      closeEmbeddedPageDialog()

      if (isMobile || isMobileViewport()) {
        router.history.push(getFullPagePath(nextPageId))
        return
      }

      writeSidePaneParams(nextPageId, options?.databaseId)
    },
    [closeEmbeddedPageDialog, isMobile, router.history, writeSidePaneParams],
  )
  const openDatabaseSidePane = useCallback(
    (databaseId: string) => {
      closeEmbeddedPageDialog()

      if (isMobile || isMobileViewport()) {
        router.history.push(getFullDatabasePath(databaseId))
        return
      }

      writeSidePaneParams(null, databaseId)
    },
    [closeEmbeddedPageDialog, isMobile, router.history, writeSidePaneParams],
  )
  const openPageInMainPane = useCallback(
    (nextPageId: string, options?: OpenPageSidePaneOptions) => {
      closeEmbeddedPageDialog()

      if (isMobile || isMobileViewport()) {
        router.history.push(getFullPagePath(nextPageId))
        return
      }

      pendingMainPanePathRef.current = getFullPagePath(nextPageId)
      writeSidePaneParams(nextPageId, options?.databaseId)
    },
    [closeEmbeddedPageDialog, isMobile, router.history, writeSidePaneParams],
  )
  const openDatabaseInMainPane = useCallback(
    (databaseId: string) => {
      closeEmbeddedPageDialog()

      if (isMobile || isMobileViewport()) {
        router.history.push(getFullDatabasePath(databaseId))
        return
      }

      pendingMainPanePathRef.current = getFullDatabasePath(databaseId)
      writeSidePaneParams(null, databaseId)
    },
    [closeEmbeddedPageDialog, isMobile, router.history, writeSidePaneParams],
  )
  const openSidePaneAsFullPage = useCallback(() => {
    const targetPath = sidePanePageId
      ? getFullPagePath(sidePanePageId)
      : sidePaneDatabaseId
        ? getFullDatabasePath(sidePaneDatabaseId)
        : null
    if (!targetPath) return

    setPromotedFullPagePath(targetPath)

    // TanStack patches the instance history methods and treats direct calls as
    // router navigations. Use the native method so promotion only replaces the
    // side-pane URL; the already-mounted pane remains the page.
    window.History.prototype.replaceState.call(
      window.history,
      window.history.state,
      "",
      targetPath,
    )
  }, [sidePaneDatabaseId, sidePanePageId])
  const openEmbeddedPageDialog = useCallback(
    (nextPageId: string, options?: OpenPageSidePaneOptions) => {
      if (isMobile || isMobileViewport()) {
        setDialogPageId(null)
        setDialogDatabaseId(null)
        router.history.push(getFullPagePath(nextPageId))
        return
      }

      closeSidePane()
      setDialogPageId(nextPageId)
      setDialogDatabaseId(options?.databaseId ?? null)
    },
    [closeSidePane, isMobile, router.history],
  )

  useEffect(() => {
    if (!isMobile) return

    if (sidePanePageId) {
      router.history.replace(getFullPagePath(sidePanePageId))
      return
    }

    if (sidePaneDatabaseId) {
      router.history.replace(getFullDatabasePath(sidePaneDatabaseId))
    }
  }, [isMobile, router.history, sidePaneDatabaseId, sidePanePageId])

  useEffect(() => {
    const sidePaneTargetKey = sidePanePageId
      ? `page:${sidePanePageId}`
      : sidePaneDatabaseId
        ? `database:${sidePaneDatabaseId}`
        : null

    if (!sidePaneTargetKey) {
      sidePaneWasOpenRef.current = false
      setSidePaneContentReady(false)
      setSidePaneAnimatedOpen(false)

      const timer = window.setTimeout(() => {
        setRenderedSidePanePageId(null)
        setRenderedSidePaneDatabaseId(null)
      }, WORKSPACE_SIDE_PANE_TRANSITION_MS)

      return () => {
        window.clearTimeout(timer)
      }
    }

    const isAlreadyOpen = sidePaneWasOpenRef.current

    setRenderedSidePanePageId(sidePanePageId)
    setRenderedSidePaneDatabaseId(
      sidePanePageId ? null : sidePaneDatabaseId,
    )
    sidePaneWasOpenRef.current = true

    if (isAlreadyOpen) {
      setSidePaneAnimatedOpen(true)
      setSidePaneContentReady(true)
      return
    }

    setSidePaneContentReady(false)
    setSidePaneAnimatedOpen(false)

    let cancelled = false
    let openFrame = 0
    let settleFrame = 0

    openFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(() => {
        if (!cancelled) {
          setSidePaneAnimatedOpen(true)
          setSidePaneContentReady(true)
        }
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(openFrame)
      cancelAnimationFrame(settleFrame)
    }
  }, [sidePaneDatabaseId, sidePanePageId])

  useLayoutEffect(() => {
    const targetPath = pendingMainPanePathRef.current
    const renderedTargetPath = renderedSidePanePageId
      ? getFullPagePath(renderedSidePanePageId)
      : renderedSidePaneDatabaseId
        ? getFullDatabasePath(renderedSidePaneDatabaseId)
        : null

    if (!targetPath || targetPath !== renderedTargetPath) return

    const panel = document.querySelector<HTMLElement>(
      "[data-page-side-pane-panel]",
    )
    const shell = panel?.closest<HTMLElement>("[data-page-side-pane-shell]")
    if (!shell) return

    shell.style.setProperty(
      "--page-side-pane-width",
      `${shell.getBoundingClientRect().width}px`,
    )
    shell.dataset.pageSidePanePromoted = "true"
    pendingMainPanePathRef.current = null
    setPromotedFullPagePath(targetPath)

    window.History.prototype.replaceState.call(
      window.history,
      window.history.state,
      "",
      targetPath,
    )
  }, [renderedSidePaneDatabaseId, renderedSidePanePageId])

  return useMemo<PageSidePaneContextValue>(
    () => ({
      closeEmbeddedPageDialog,
      closeSidePane,
      dialogDatabaseId,
      dialogPageId,
      embeddedItemsOpenAs,
      mainPaneNavigationActive: Boolean(
        promotedFullPagePath || pendingMainPanePathRef.current,
      ),
      openEmbeddedPageDialog,
      openDatabaseInMainPane,
      openDatabaseSidePane,
      openPageInMainPane,
      openSidePaneAsFullPage,
      openSidePane,
      renderedSidePaneDatabaseId,
      renderedSidePanePageId,
      sidePaneAnimatedOpen,
      sidePaneContentReady,
      sidePaneDatabaseId,
      sidePanePageId,
    }),
    [
      closeEmbeddedPageDialog,
      closeSidePane,
      dialogDatabaseId,
      dialogPageId,
      embeddedItemsOpenAs,
      promotedFullPagePath,
      openEmbeddedPageDialog,
      openDatabaseInMainPane,
      openDatabaseSidePane,
      openPageInMainPane,
      openSidePaneAsFullPage,
      openSidePane,
      renderedSidePaneDatabaseId,
      renderedSidePanePageId,
      sidePaneAnimatedOpen,
      sidePaneContentReady,
      sidePaneDatabaseId,
      sidePanePageId,
    ],
  )
}

function getSearchParam(search: string, key: string) {
  return new URLSearchParams(search).get(key)?.trim() || null
}

export function getSidePaneDatabaseParam(
  pathname: string,
  databaseId?: string | null,
) {
  if (!databaseId) {
    return null
  }

  const routeDatabaseId = pathname.match(/^\/d\/([^/]+)/)?.[1]
  if (!routeDatabaseId) {
    return databaseId
  }

  return decodeURIComponent(routeDatabaseId) === databaseId ? null : databaseId
}

export function PageSidePaneProvider({
  children,
  embeddedItemsOpenAs = "sidepanel",
  resetKey,
}: {
  children: ReactNode
  embeddedItemsOpenAs?: EmbeddedItemsOpenAs
  resetKey?: string | null
}) {
  const sidePaneContext = usePageSidePaneState(resetKey, embeddedItemsOpenAs)

  return (
    <PageSidePaneContext.Provider value={sidePaneContext}>
      {children}
    </PageSidePaneContext.Provider>
  )
}

export function usePageSidePane() {
  const context = useContext(PageSidePaneContext)

  if (!context) {
    throw new Error("usePageSidePane must be used inside a side pane provider")
  }

  return context
}

export function useOptionalPageSidePane() {
  return useContext(PageSidePaneContext)
}

export function getPageSidePaneWidthClass() {
  return "min-w-0"
}
