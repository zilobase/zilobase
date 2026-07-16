"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ComponentProps,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react"
import type { PanelImperativeHandle, PanelSize } from "react-resizable-panels"

import {
  getRightSidebarDockMinSize,
  getSidebarResizeIntent,
  interpolateSidebarPanelPercentage,
  resolveSidebarPanelPercentage,
  RIGHT_SIDEBAR_SINGLE_DEFAULT_SIZE,
  RIGHT_SIDEBAR_SINGLE_MAX_SIZE,
  RIGHT_SIDEBAR_SPLIT_DEFAULT_SIZE,
  RIGHT_SIDEBAR_SPLIT_MAX_SIZE,
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
const panelPercentage = (size: number) => `${size}%`

export function RightSidebarSurface({
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

export function ResizableRightSidebarPanel({
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
  const layoutChanged =
    previousState.open !== open ||
    (open && previousState.defaultSize !== defaultSize)
  const transitioning = animating || layoutChanged

  useEffect(() => () => pointerCleanupRef.current(), [])

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

  const handlePanelResize = useCallback(
    ({ inPixels }: PanelSize) => onWidthChange?.(inPixels),
    [onWidthChange],
  )

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

    const startSize = panel.getSize().asPercentage
    const targetSize = open
      ? resolveSidebarPanelPercentage(
          defaultSize,
          element.parentElement?.getBoundingClientRect().width ?? 0,
        )
      : 0
    const skipAnimation =
      document.hidden ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      Math.abs(startSize - targetSize) < 0.01
    let animationFrame = 0

    if (skipAnimation) {
      panel.resize(`${targetSize}%`)
      setAnimating(false)
      return
    }

    const startedAt = performance.now()
    const animate = (now: number) => {
      const progress = Math.min(
        (now - startedAt) / RIGHT_SIDEBAR_TRANSITION_MS,
        1,
      )
      const nextSize = interpolateSidebarPanelPercentage(
        startSize,
        targetSize,
        progress,
      )

      panel.resize(`${nextSize}%`)

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      } else {
        setAnimating(false)
      }
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [animating, defaultSize, open])

  return (
    <>
      <ResizableHandle
        className={
          open
            ? "opacity-100 transition-opacity duration-200 motion-reduce:transition-none"
            : "pointer-events-none w-0 opacity-0 transition-opacity duration-200 after:hidden motion-reduce:transition-none"
        }
        disabled={!open || transitioning}
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
        defaultSize={open ? defaultSize : "0%"}
        elementRef={panelElementRef}
        id={panelId}
        maxSize={maxSize}
        minSize={!open || transitioning ? "0%" : minSize}
        onResize={onWidthChange ? handlePanelResize : undefined}
        panelRef={panelHandleRef}
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <RightSidebarSurface
          aria-hidden={!open}
          aria-label={ariaLabel}
          className={
            open
              ? "translate-x-0 opacity-100 transition-[transform,opacity] duration-320 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
              : "pointer-events-none translate-x-3 opacity-0 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none"
          }
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
        "fixed inset-y-0 right-0 h-svh w-[min(100vw,var(--right-sidebar-panel-width))] border-l border-sidebar-border transition-[transform,opacity] duration-320 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
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

type SidebarPanelSelection = {
  ariaLabel: string
  key: "discussions" | "page" | "view-settings"
  panel: ReactNode
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
  const openPanelCount = Number(chatOpen) + Number(primaryPanel !== null)
  const dockOpen = openPanelCount > 0
  const splitDock = openPanelCount === 2
  const updateAdjacentPanelWidth = useAdjacentPanelWidth(
    !isMobile && primaryPanel !== null,
  )

  if (isMobile) return null

  return (
    <ResizableRightSidebarPanel
      ariaLabel="Right sidebar dock"
      defaultSize={panelPercentage(
        splitDock
          ? RIGHT_SIDEBAR_SPLIT_DEFAULT_SIZE * 2
          : RIGHT_SIDEBAR_SINGLE_DEFAULT_SIZE,
      )}
      maxSize={panelPercentage(
        splitDock
          ? RIGHT_SIDEBAR_SPLIT_MAX_SIZE * 2
          : RIGHT_SIDEBAR_SINGLE_MAX_SIZE,
      )}
      minSize={panelPercentage(
        getRightSidebarDockMinSize(splitDock, navigationSidebarOpen),
      )}
      onResizeIntent={onResizeIntent}
      onWidthChange={updateAdjacentPanelWidth}
      open={dockOpen}
      panelId="right-sidebar-dock"
    >
      <div
        className="grid min-h-0 min-w-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-320 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{
          gridTemplateColumns: `${primaryPanel ? visibleGridTrack : hiddenGridTrack} ${chatOpen ? visibleGridTrack : hiddenGridTrack}`,
        }}
      >
        <section
          aria-hidden={!primaryPanel}
          aria-label={primaryPanel?.ariaLabel}
          className="min-h-0 min-w-0 overflow-hidden"
          inert={primaryPanel ? undefined : true}
        >
          {primaryPanel ? (
            <div
              className="h-full min-h-0 animate-in fade-in-0 slide-in-from-right-1 duration-200 motion-reduce:animate-none"
              key={primaryPanel.key}
            >
              {primaryPanel.panel}
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
          {primaryPanel ? (
            <div
              className="h-full min-h-0 animate-in fade-in-0 slide-in-from-right-1 duration-200 motion-reduce:animate-none"
              key={primaryPanel.key}
            >
              {primaryPanel.panel}
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
