"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type {
  ComponentProps,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import {
  APP_SIDEBAR_PANEL_WIDTH,
  getRightSidebarDockSizes,
  getSidebarResizeIntent,
  resolveSidebarPanelPercentage,
  RIGHT_SIDEBAR_TRANSITION_MS,
  type SidebarResizeIntent,
} from "@/components/sidebar-panel-sizing"
import {
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable"
import { cn } from "@/lib/utils"

const noOp = () => {}
const hiddenGridTrack = "minmax(0, 0fr)"
const visibleGridTrack = "minmax(0, 1fr)"
function RightSidebarSurface({
  className,
  ...props
}: ComponentProps<"aside">) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
      {...props}
    />
  )
}

type ResizableRightSidebarPanelProps = {
  ariaLabel: string
  children: ReactNode
  defaultSize: string
  maxSize: string
  minSize: string
  onResizeIntent?: (intent: SidebarResizeIntent) => void
  onWidthChange?: (width: number) => void
  open: boolean
  panelId: string
}

function ResizableRightSidebarPanel({
  ariaLabel,
  children,
  defaultSize,
  maxSize,
  minSize,
  onResizeIntent,
  onWidthChange,
  open,
  panelId,
}: ResizableRightSidebarPanelProps) {
  const panelElementRef = useRef<HTMLDivElement | null>(null)
  const panelHandleRef = useRef<PanelImperativeHandle | null>(null)
  const pointerCleanupRef = useRef<() => void>(noOp)
  const previousStateRef = useRef({ defaultSize, open })
  const [animating, setAnimating] = useState(false)
  const previousState = previousStateRef.current
  const fixedSize = minSize === maxSize
  const layoutChanged =
    previousState.open !== open ||
    (open && previousState.defaultSize !== defaultSize)
  const transitioning = animating || layoutChanged

  useEffect(() => () => pointerCleanupRef.current(), [])

  useLayoutEffect(() => {
    const element = panelElementRef.current
    const groupWidth =
      element?.parentElement?.getBoundingClientRect().width ?? 0

    if (!element || groupWidth <= 0) return

    const targetPercentage = resolveSidebarPanelPercentage(
      defaultSize,
      groupWidth,
    )
    const targetWidth = (groupWidth * targetPercentage) / 100

    element.style.setProperty(
      "--right-sidebar-surface-width",
      `${targetWidth}px`,
    )
  }, [defaultSize, open])

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!onResizeIntent || event.button !== 0) return

      const startX = event.clientX
      pointerCleanupRef.current()

      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", cleanup)
        window.removeEventListener("pointercancel", cleanup)
        pointerCleanupRef.current = noOp
      }
      const handlePointerMove = (moveEvent: PointerEvent) => {
        const intent = getSidebarResizeIntent(moveEvent.clientX - startX)
        if (!intent) return

        onResizeIntent(intent)
        cleanup()
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", cleanup)
      window.addEventListener("pointercancel", cleanup)
      pointerCleanupRef.current = cleanup
    },
    [onResizeIntent],
  )

  useEffect(() => {
    const element = panelElementRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return

      const width = entry.contentRect.width
      onWidthChange?.(width)

      if (!transitioning && width > 0) {
        element.style.setProperty(
          "--right-sidebar-surface-width",
          `${width}px`,
        )
      }
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [onWidthChange, transitioning])

  useEffect(() => {
    const stateChanged =
      previousStateRef.current.open !== open ||
      (open && previousStateRef.current.defaultSize !== defaultSize)

    previousStateRef.current = { defaultSize, open }
    if (stateChanged) setAnimating(true)
  }, [defaultSize, open])

  useEffect(() => {
    if (!animating) return

    const element = panelElementRef.current
    const panel = panelHandleRef.current

    if (!element || !panel) {
      setAnimating(false)
      return
    }

    const targetSize = open
      ? resolveSidebarPanelPercentage(
          defaultSize,
          element.parentElement?.getBoundingClientRect().width ?? 0,
        )
      : 0
    const skipAnimation =
      document.hidden ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (skipAnimation) {
      panel.resize(`${targetSize}%`)
      setAnimating(false)
      return
    }

    let animationFrame = 0
    let transitionTimeout = 0
    const finishTransition = () => setAnimating(false)
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target === element && event.propertyName === "flex-grow") {
        finishTransition()
      }
    }

    element.addEventListener("transitionend", handleTransitionEnd)
    animationFrame = requestAnimationFrame(() => {
      panel.resize(`${targetSize}%`)
      transitionTimeout = window.setTimeout(
        finishTransition,
        RIGHT_SIDEBAR_TRANSITION_MS + 50,
      )
    })

    return () => {
      cancelAnimationFrame(animationFrame)
      window.clearTimeout(transitionTimeout)
      element.removeEventListener("transitionend", handleTransitionEnd)
    }
  }, [animating, defaultSize, open])

  return (
    <>
      <ResizableHandle
        className={
          open
            ? "opacity-100 transition-opacity duration-200 motion-reduce:transition-none"
            : "pointer-events-none w-0 opacity-0 transition-opacity duration-200 after:hidden motion-reduce:transition-none"
        }
        disabled={!open || transitioning || fixedSize}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            onResizeIntent?.("increase")
          } else if (event.key === "ArrowRight") {
            onResizeIntent?.("decrease")
          }
        }}
        onPointerDown={onResizeIntent ? handleResizePointerDown : undefined}
        withHandle={open}
      />
      <ResizablePanel
        className="min-h-0 min-w-0"
        data-sidebar-transitioning={transitioning ? "" : undefined}
        defaultSize={open ? defaultSize : "0%"}
        elementRef={panelElementRef}
        id={panelId}
        maxSize={transitioning ? "100%" : maxSize}
        minSize={!open || transitioning ? "0%" : minSize}
        panelRef={panelHandleRef}
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <RightSidebarSurface
          aria-hidden={!open}
          aria-label={ariaLabel}
          className={cn(
            "absolute inset-y-0 right-0 w-[min(100vw,var(--right-sidebar-surface-width,100%))] will-change-transform transition-transform duration-320 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            open
              ? "translate-x-0"
              : "pointer-events-none translate-x-full",
          )}
          inert={open ? undefined : true}
        >
          {children}
        </RightSidebarSurface>
      </ResizablePanel>
    </>
  )
}

type OverlayRightSidebarPanelProps = {
  ariaLabel: string
  children: ReactNode
  open: boolean
  panelId: string
  rightOffset?: boolean
  zIndexClassName?: string
}

function OverlayRightSidebarPanel({
  ariaLabel,
  children,
  open,
  panelId,
  rightOffset = false,
  zIndexClassName = "z-40",
}: OverlayRightSidebarPanelProps) {
  return (
    <RightSidebarSurface
      aria-hidden={!open}
      aria-label={ariaLabel}
      id={panelId}
      className={cn(
        "fixed inset-y-0 right-0 h-svh w-[min(100vw,var(--right-sidebar-panel-width))] border-l border-border transition-[transform,opacity] duration-320 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        zIndexClassName,
        open
          ? rightOffset
            ? "-translate-x-full"
            : "translate-x-0"
          : "pointer-events-none translate-x-full opacity-0",
      )}
      inert={open ? undefined : true}
    >
      {children}
    </RightSidebarSurface>
  )
}

type SidebarPanelKey = "discussions" | "page" | "view-settings"

type SidebarPanelSelection = {
  ariaLabel: string
  key: SidebarPanelKey
  panel: ReactNode
}

function useRetainedSidebarPanel(
  panel: SidebarPanelSelection | null,
  availablePanels: Partial<Record<SidebarPanelKey, ReactNode>>,
) {
  const renderedPanelRef = useRef(panel)

  if (panel) {
    renderedPanelRef.current = panel
  } else if (renderedPanelRef.current) {
    const currentPanel = availablePanels[renderedPanelRef.current.key]
    if (currentPanel != null) {
      renderedPanelRef.current = {
        ...renderedPanelRef.current,
        panel: currentPanel,
      }
    }
  }

  return renderedPanelRef.current
}

type PrimarySidebarPanelOptions = {
  discussionsEnabled: boolean
  discussionsOpen: boolean
  discussionsPanel?: ReactNode
  pageSidebarOpen: boolean
  pageSidebarPanel?: ReactNode
  utilitySidebarOpen?: boolean
  utilitySidebarPanel?: ReactNode
}

function selectPrimarySidebarPanel({
  discussionsEnabled,
  discussionsOpen,
  discussionsPanel,
  pageSidebarOpen,
  pageSidebarPanel,
  utilitySidebarOpen = false,
  utilitySidebarPanel,
}: PrimarySidebarPanelOptions): SidebarPanelSelection | null {
  if (utilitySidebarOpen && utilitySidebarPanel != null) {
    return {
      ariaLabel: "View settings sidebar",
      key: "view-settings",
      panel: utilitySidebarPanel,
    }
  }

  if (pageSidebarOpen && pageSidebarPanel != null) {
    return {
      ariaLabel: "Page sidebar",
      key: "page",
      panel: pageSidebarPanel,
    }
  }

  if (discussionsEnabled && discussionsOpen && discussionsPanel != null) {
    return {
      ariaLabel: "Discussions sidebar",
      key: "discussions",
      panel: discussionsPanel,
    }
  }

  return null
}

function useAdjacentPanelWidth(enabled: boolean) {
  const lastWidthRef = useRef<number | null>(null)
  const updateWidth = useCallback((width: number) => {
    const roundedWidth = Math.round(width)
    if (lastWidthRef.current === roundedWidth) return

    lastWidthRef.current = roundedWidth
    document.documentElement.style.setProperty(
      "--right-sidebar-adjacent-panel-width",
      `${roundedWidth}px`,
    )
  }, [])

  useEffect(() => {
    if (!enabled) {
      lastWidthRef.current = null
      document.documentElement.style.removeProperty(
        "--right-sidebar-adjacent-panel-width",
      )
    }

    return () => {
      lastWidthRef.current = null
      document.documentElement.style.removeProperty(
        "--right-sidebar-adjacent-panel-width",
      )
    }
  }, [enabled])

  return enabled ? updateWidth : undefined
}

export function RightSidebars({
  chatOpen,
  chatPanel,
  discussionsEnabled,
  discussionsOpen,
  discussionsPanel,
  isMobile,
  navigationSidebarOpen,
  onResizeIntent,
  pageSidebarOpen = false,
  pageSidebarPanel,
  utilitySidebarOpen = false,
  utilitySidebarPanel,
}: {
  chatOpen: boolean
  chatPanel: ReactNode
  discussionsEnabled: boolean
  discussionsOpen: boolean
  discussionsPanel?: ReactNode
  isMobile: boolean
  navigationSidebarOpen: boolean
  onResizeIntent?: (intent: SidebarResizeIntent) => void
  pageSidebarOpen?: boolean
  pageSidebarPanel?: ReactNode
  utilitySidebarOpen?: boolean
  utilitySidebarPanel?: ReactNode
}) {
  const primaryPanel = selectPrimarySidebarPanel({
    discussionsEnabled,
    discussionsOpen,
    discussionsPanel,
    pageSidebarOpen,
    pageSidebarPanel,
    utilitySidebarOpen,
    utilitySidebarPanel,
  })
  const renderedPrimaryPanel = useRetainedSidebarPanel(primaryPanel, {
    discussions: discussionsPanel,
    page: pageSidebarPanel,
    "view-settings": utilitySidebarPanel,
  })
  const openPanelCount = Number(chatOpen) + Number(primaryPanel !== null)
  const dockOpen = openPanelCount > 0
  const splitDock = openPanelCount === 2
  const dockSizes = getRightSidebarDockSizes({
    fixedSinglePanelWidth:
      primaryPanel?.key === "view-settings"
        ? APP_SIDEBAR_PANEL_WIDTH
        : undefined,
    navigationSidebarOpen,
    splitDock,
  })
  const updateAdjacentPanelWidth = useAdjacentPanelWidth(
    !isMobile && primaryPanel !== null,
  )

  if (isMobile) return null

  return (
    <ResizableRightSidebarPanel
      ariaLabel="Right sidebar dock"
      defaultSize={dockSizes.defaultSize}
      maxSize={dockSizes.maxSize}
      minSize={dockSizes.minSize}
      onResizeIntent={onResizeIntent}
      onWidthChange={updateAdjacentPanelWidth}
      open={dockOpen}
      panelId="right-sidebar-dock"
    >
      <div
        className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
        style={{
          gridTemplateColumns: `${primaryPanel ? visibleGridTrack : hiddenGridTrack} ${chatOpen ? visibleGridTrack : hiddenGridTrack}`,
        }}
      >
        <section
          aria-hidden={!primaryPanel}
          aria-label={
            primaryPanel?.ariaLabel ?? renderedPrimaryPanel?.ariaLabel
          }
          className="min-h-0 min-w-0 overflow-hidden"
          inert={primaryPanel ? undefined : true}
        >
          {renderedPrimaryPanel ? (
            <div
              className="h-full min-h-0 animate-in fade-in-0 slide-in-from-right-1 duration-200 motion-reduce:animate-none"
              key={renderedPrimaryPanel.key}
            >
              {renderedPrimaryPanel.panel}
            </div>
          ) : null}
        </section>
        <section
          aria-hidden={!chatOpen}
          aria-label="Chat sidebar"
          className={cn(
            "min-h-0 min-w-0 overflow-hidden",
            splitDock && "border-l border-border",
          )}
          data-ai-chat-sidebar-panel
          inert={chatOpen ? undefined : true}
        >
          {chatPanel}
        </section>
      </div>
    </ResizableRightSidebarPanel>
  )
}

export function RightSidebarMobilePanels({
  chatOpen,
  chatPanel,
  discussionsEnabled,
  discussionsOpen,
  discussionsPanel,
  isMobile,
  pageSidebarOpen = false,
  pageSidebarPanel,
}: {
  chatOpen: boolean
  chatPanel: ReactNode
  discussionsEnabled: boolean
  discussionsOpen: boolean
  discussionsPanel?: ReactNode
  isMobile: boolean
  pageSidebarOpen?: boolean
  pageSidebarPanel?: ReactNode
}) {
  const primaryPanel = selectPrimarySidebarPanel({
    discussionsEnabled,
    discussionsOpen,
    discussionsPanel,
    pageSidebarOpen,
    pageSidebarPanel,
  })
  const renderedPrimaryPanel = useRetainedSidebarPanel(primaryPanel, {
    discussions: discussionsPanel,
    page: pageSidebarPanel,
  })
  const primaryPanelAvailable =
    pageSidebarPanel != null || discussionsPanel != null

  if (!isMobile) return null

  return (
    <div className="md:hidden">
      {primaryPanelAvailable ? (
        <OverlayRightSidebarPanel
          ariaLabel={primaryPanel?.ariaLabel ?? "Right sidebar"}
          open={primaryPanel !== null}
          panelId="mobile-right-sidebar-primary"
          rightOffset={chatOpen}
        >
          {renderedPrimaryPanel ? (
            <div
              className="h-full min-h-0 animate-in fade-in-0 slide-in-from-right-1 duration-200 motion-reduce:animate-none"
              key={renderedPrimaryPanel.key}
            >
              {renderedPrimaryPanel.panel}
            </div>
          ) : null}
        </OverlayRightSidebarPanel>
      ) : null}
      <OverlayRightSidebarPanel
        ariaLabel="Chat sidebar"
        open={chatOpen}
        panelId="mobile-right-sidebar-chat"
        zIndexClassName="z-50"
      >
        {chatPanel}
      </OverlayRightSidebarPanel>
    </div>
  )
}
