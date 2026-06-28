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

import { cn } from "@/lib/utils"

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
  openSidePane: (
    pageId: string,
    options?: OpenPageSidePaneOptions,
  ) => void
  renderedSidePanePageId: string | null
  sidePaneAnimatedOpen: boolean
  sidePaneContentReady: boolean
  sidePaneDatabaseId: string | null
  sidePanePageId: string | null
}

export const PageSidePaneContext =
  createContext<PageSidePaneContextValue | null>(null)

export const WORKSPACE_SIDE_PANE_TRANSITION_MS = 320

const WORKSPACE_SIDE_PANE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)"

export const pageSidePaneGridShellClass =
  "grid min-h-0 flex-1 overflow-hidden [grid-template-rows:3rem_minmax(0,1fr)]"

export const pageSidePaneMobilePanelTransitionClass =
  "max-md:transition-[transform,opacity] max-md:duration-320 max-md:ease-[cubic-bezier(0.16,1,0.3,1)] max-md:motion-reduce:transition-none"

export function getPageSidePaneGridStyle(
  visible: boolean,
  open: boolean,
): CSSProperties {
  return {
    gridTemplateColumns: visible
      ? open
        ? "minmax(0, 1fr) minmax(0, 1fr)"
        : "minmax(0, 1fr) minmax(0, 0fr)"
      : "minmax(0, 1fr)",
    transition: `grid-template-columns ${WORKSPACE_SIDE_PANE_TRANSITION_MS}ms ${WORKSPACE_SIDE_PANE_EASING}`,
  }
}

export function getPageSidePaneMobilePanelClassName(open: boolean) {
  return cn(
    "max-md:absolute max-md:inset-0 max-md:z-10 max-md:flex max-md:w-full max-md:flex-col max-md:overflow-hidden max-md:border-l-0 max-md:bg-background",
    pageSidePaneMobilePanelTransitionClass,
    open
      ? "max-md:opacity-100 max-md:[transform:translate3d(0,0,0)]"
      : "max-md:pointer-events-none max-md:opacity-0 max-md:[transform:translate3d(100%,0,0)]",
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
    side === "side" && splitActive && "border-l border-border",
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
  resetKey?: string | null,
): PageSidePaneContextValue {
  const [sidePanePageId, setSidePanePageId] = useState<string | null>(
    null,
  )
  const [sidePaneDatabaseId, setSidePaneDatabaseId] = useState<string | null>(
    null,
  )
  const [dialogPageId, setDialogPageId] = useState<string | null>(
    null,
  )
  const [dialogDatabaseId, setDialogDatabaseId] = useState<string | null>(null)
  const [renderedSidePanePageId, setRenderedSidePanePageId] =
    useState<string | null>(null)
  const [sidePaneAnimatedOpen, setSidePaneAnimatedOpen] = useState(false)
  const [sidePaneContentReady, setSidePaneContentReady] = useState(false)
  const sidePaneWasOpenRef = useRef(false)
  const closeSidePane = useCallback(() => {
    setSidePanePageId(null)
    setSidePaneDatabaseId(null)
  }, [])
  const closeEmbeddedPageDialog = useCallback(() => {
    setDialogPageId(null)
    setDialogDatabaseId(null)
  }, [])
  const openSidePane = useCallback(
    (nextPageId: string, options?: OpenPageSidePaneOptions) => {
      closeEmbeddedPageDialog()
      setSidePanePageId(nextPageId)
      setSidePaneDatabaseId(options?.databaseId ?? null)
    },
    [closeEmbeddedPageDialog],
  )
  const openEmbeddedPageDialog = useCallback(
    (nextPageId: string, options?: OpenPageSidePaneOptions) => {
      closeSidePane()
      setDialogPageId(nextPageId)
      setDialogDatabaseId(options?.databaseId ?? null)
    },
    [closeSidePane],
  )

  useEffect(() => {
    if (!sidePanePageId) {
      sidePaneWasOpenRef.current = false
      setSidePaneContentReady(false)
      setSidePaneAnimatedOpen(false)

      const timer = window.setTimeout(() => {
        setRenderedSidePanePageId(null)
      }, WORKSPACE_SIDE_PANE_TRANSITION_MS)

      return () => {
        window.clearTimeout(timer)
      }
    }

    const isAlreadyOpen = sidePaneWasOpenRef.current

    setRenderedSidePanePageId(sidePanePageId)
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
    let contentTimer = 0

    openFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(() => {
        if (!cancelled) {
          setSidePaneAnimatedOpen(true)
        }
      })
    })
    contentTimer = window.setTimeout(() => {
      if (!cancelled) {
        setSidePaneContentReady(true)
      }
    }, WORKSPACE_SIDE_PANE_TRANSITION_MS)

    return () => {
      cancelled = true
      cancelAnimationFrame(openFrame)
      cancelAnimationFrame(settleFrame)
      window.clearTimeout(contentTimer)
    }
  }, [sidePanePageId])

  useEffect(() => {
    closeSidePane()
    closeEmbeddedPageDialog()
  }, [closeEmbeddedPageDialog, closeSidePane, resetKey])

  return useMemo<PageSidePaneContextValue>(
    () => ({
      closeEmbeddedPageDialog,
      closeSidePane,
      dialogDatabaseId,
      dialogPageId,
      openEmbeddedPageDialog,
      openSidePane,
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
      openSidePane,
      renderedSidePanePageId,
      sidePaneAnimatedOpen,
      sidePaneContentReady,
      sidePaneDatabaseId,
      sidePanePageId,
    ],
  )
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