import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { useLocation, useRouter } from "@tanstack/react-router"

import { cn } from "@/lib/utils"
import { isMobileViewport, useIsMobile } from "@/hooks/use-mobile"

export type OpenPageSidePaneOptions = {
  databaseId?: string | null
}

export type PageSidePaneContextValue = {
  closeEmbeddedPageDialog: () => void
  closeSidePane: () => void
  dialogDatabaseId: string | null
  dialogPageId: string | null
  openEmbeddedPageDialog: (
    pageId: string,
    options?: OpenPageSidePaneOptions,
  ) => void
  openDatabaseSidePane: (databaseId: string) => void
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

const SIDE_PANE_PAGE_PARAM = "p"
const SIDE_PANE_DATABASE_PARAM = "d"

export const getFullPagePath = (pageId: string) =>
  `/p/${encodeURIComponent(pageId)}`

export const getFullDatabasePath = (databaseId: string) =>
  `/d/${encodeURIComponent(databaseId)}`

export const pageSidePaneGridShellClass =
  "grid min-h-0 flex-1 overflow-hidden [grid-template-rows:3rem_minmax(0,1fr)]"

export const pageSidePaneMobilePanelTransitionClass =
  "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"

export function getPageSidePaneGridStyle(
  visible: boolean,
  _open: boolean,
): CSSProperties {
  return {
    gridTemplateColumns: visible
      ? "minmax(0, 1fr) minmax(0, 1fr)"
      : "minmax(0, 1fr)",
  }
}

export function getPageSidePaneMobilePanelClassName(open: boolean) {
  return cn(
    "max-md:absolute max-md:inset-0 max-md:z-10 max-md:flex max-md:w-full max-md:flex-col max-md:overflow-hidden max-md:border-l-0 max-md:bg-background",
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
  return (
    <div
      className={cn(
        "relative isolate max-md:[grid-template-columns:minmax(0,1fr)!important]",
        header
          ? pageSidePaneGridShellClass
          : "grid min-h-0 flex-1 overflow-hidden [grid-template-rows:minmax(0,1fr)]",
        className,
      )}
      style={getPageSidePaneGridStyle(visible, open)}
    >
      {header ? (
        <header className="col-span-full grid h-12 grid-cols-subgrid overflow-hidden">
          {header}
        </header>
      ) : null}
      <div className="relative col-span-full row-start-2 grid min-h-0 grid-cols-subgrid overflow-hidden">
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
    "flex h-12 min-h-0 min-w-0 items-center overflow-hidden bg-background",
    side === "side" && [
      "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
      splitActive
        ? "border-l border-border [transform:translate3d(0,0,0)]"
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
    <div
      className={cn(
        "min-h-0 min-w-0 overflow-y-auto [scrollbar-gutter:stable]",
        className,
      )}
    >
      {children}
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
  if (!show) {
    return null
  }

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-background",
        getPageSidePaneMobilePanelClassName(open),
        className,
      )}
      data-page-side-pane-panel
      inert={open ? undefined : true}
    >
      <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto [scrollbar-gutter:stable]">
        {children}
      </div>
    </aside>
  )
}

export function PageSidePaneLayout({
  className,
  main,
  sidePane,
  sidePaneClassName,
  sidePaneOpen,
  sidePaneVisible,
  standalone = false,
  viewportHeightClass = "h-[calc(100svh-3rem)]",
}: {
  className?: string
  main: ReactNode
  sidePane: ReactNode | null
  sidePaneClassName?: string
  sidePaneOpen: boolean
  sidePaneVisible: boolean
  standalone?: boolean
  viewportHeightClass?: string
}) {
  const split = (
    <>
      <PageSidePaneMainCell className={standalone ? undefined : "min-h-0"}>
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
): PageSidePaneContextValue {
  const router = useRouter()
  const isMobile = useIsMobile()
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

  return useMemo<PageSidePaneContextValue>(
    () => ({
      closeEmbeddedPageDialog,
      closeSidePane,
      dialogDatabaseId,
      dialogPageId,
      openEmbeddedPageDialog,
      openDatabaseSidePane,
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
      openEmbeddedPageDialog,
      openDatabaseSidePane,
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
  resetKey,
}: {
  children: ReactNode
  resetKey?: string | null
}) {
  const sidePaneContext = usePageSidePaneState(resetKey)

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
