"use client"

import { useCallback, useEffect, useRef } from "react"
import type { ComponentProps, ReactNode } from "react"

import {
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

export const RIGHT_SIDEBAR_SINGLE_MAX_SIZE = 100 / 3
export const RIGHT_SIDEBAR_SPLIT_MAX_SIZE = 25
export const RIGHT_SIDEBAR_SINGLE_DEFAULT_SIZE = 28
export const RIGHT_SIDEBAR_SPLIT_DEFAULT_SIZE = 22

const RIGHT_SIDEBAR_MIN_SIZE = 18
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

export function getRightSidebarEditorMinSize(openPanelCount: number) {
  if (openPanelCount >= 2) {
    return panelPercentage(100 - RIGHT_SIDEBAR_SPLIT_MAX_SIZE * 2)
  }

  if (openPanelCount === 1) {
    return panelPercentage(100 - RIGHT_SIDEBAR_SINGLE_MAX_SIZE)
  }

  return "0%"
}

export function getRightSidebarEditorDefaultSize(openPanelCount: number) {
  if (openPanelCount >= 2) {
    return panelPercentage(100 - RIGHT_SIDEBAR_SPLIT_DEFAULT_SIZE * 2)
  }

  if (openPanelCount === 1) {
    return panelPercentage(100 - RIGHT_SIDEBAR_SINGLE_DEFAULT_SIZE)
  }

  return "100%"
}

function RightSidebarDesktopPanel({
  ariaLabel,
  children,
  onWidthChange,
  openPanelCount,
  panelId,
}: {
  ariaLabel: string
  children: ReactNode
  onWidthChange?: (width: number) => void
  openPanelCount: number
  panelId: string
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const maxSize =
    openPanelCount >= 2
      ? RIGHT_SIDEBAR_SPLIT_MAX_SIZE
      : RIGHT_SIDEBAR_SINGLE_MAX_SIZE
  const defaultSize =
    openPanelCount >= 2
      ? RIGHT_SIDEBAR_SPLIT_DEFAULT_SIZE
      : RIGHT_SIDEBAR_SINGLE_DEFAULT_SIZE

  useEffect(() => {
    if (!onWidthChange || !panelRef.current) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        onWidthChange(entry.contentRect.width)
      }
    })

    observer.observe(panelRef.current)

    return () => {
      observer.disconnect()
    }
  }, [onWidthChange])

  return (
    <>
      <ResizableHandle withHandle />
      <ResizablePanel
        className="min-h-0 min-w-0"
        defaultSize={panelPercentage(defaultSize)}
        elementRef={panelRef}
        id={panelId}
        maxSize={panelPercentage(maxSize)}
        minSize={panelPercentage(RIGHT_SIDEBAR_MIN_SIZE)}
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <RightSidebarSurface aria-label={ariaLabel}>
          {children}
        </RightSidebarSurface>
      </ResizablePanel>
    </>
  )
}

function RightSidebarMobilePanel({
  ariaLabel,
  children,
  open,
  rightOffset = false,
  zIndexClassName = "z-40",
}: {
  ariaLabel: string
  children: ReactNode
  open: boolean
  rightOffset?: boolean
  zIndexClassName?: string
}) {
  return (
    <RightSidebarSurface
      aria-hidden={!open}
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-y-0 h-svh w-[min(100vw,var(--right-sidebar-panel-width))] border-l border-sidebar-border transition-[right] duration-200 ease-linear",
        zIndexClassName,
        open
          ? rightOffset
            ? "right-(--right-sidebar-panel-width)"
            : "right-0"
          : "pointer-events-none right-[calc(min(100vw,var(--right-sidebar-panel-width))*-1)]",
      )}
      inert={open ? undefined : true}
    >
      {children}
    </RightSidebarSurface>
  )
}

export function RightSidebars({
  chatOpen,
  chatPanel,
  discussionsEnabled,
  discussionsOpen,
  discussionsPanel,
  pageSidebarOpen = false,
  pageSidebarPanel,
}: {
  chatOpen: boolean
  chatPanel: ReactNode
  discussionsEnabled: boolean
  discussionsOpen: boolean
  discussionsPanel?: ReactNode
  pageSidebarOpen?: boolean
  pageSidebarPanel?: ReactNode
}) {
  const isMobile = useIsMobile()
  const openPanelCount =
    (chatOpen ? 1 : 0) +
    (discussionsEnabled && discussionsOpen ? 1 : 0) +
    (pageSidebarOpen ? 1 : 0)
  const updateAdjacentPanelWidth = useCallback((width: number) => {
    document.documentElement.style.setProperty(
      "--right-sidebar-adjacent-panel-width",
      `${width}px`,
    )
  }, [])

  useEffect(() => {
    if (!discussionsOpen && !pageSidebarOpen) {
      document.documentElement.style.removeProperty(
        "--right-sidebar-adjacent-panel-width",
      )
    }
  }, [discussionsOpen, pageSidebarOpen])

  if (isMobile) {
    return null
  }

  return (
    <>
      {pageSidebarOpen && pageSidebarPanel ? (
        <RightSidebarDesktopPanel
          ariaLabel="Page sidebar"
          onWidthChange={updateAdjacentPanelWidth}
          openPanelCount={openPanelCount}
          panelId="right-sidebar-page"
        >
          {pageSidebarPanel}
        </RightSidebarDesktopPanel>
      ) : null}

      {discussionsEnabled && discussionsOpen && discussionsPanel ? (
        <RightSidebarDesktopPanel
          ariaLabel="Discussions sidebar"
          onWidthChange={updateAdjacentPanelWidth}
          openPanelCount={openPanelCount}
          panelId="right-sidebar-discussions"
        >
          {discussionsPanel}
        </RightSidebarDesktopPanel>
      ) : null}

      {chatOpen ? (
        <RightSidebarDesktopPanel
          ariaLabel="Chat sidebar"
          openPanelCount={openPanelCount}
          panelId="right-sidebar-chat"
        >
          {chatPanel}
        </RightSidebarDesktopPanel>
      ) : null}
    </>
  )
}

export function RightSidebarMobilePanels({
  chatOpen,
  chatPanel,
  discussionsEnabled,
  discussionsOpen,
  discussionsPanel,
  pageSidebarOpen = false,
  pageSidebarPanel,
}: {
  chatOpen: boolean
  chatPanel: ReactNode
  discussionsEnabled: boolean
  discussionsOpen: boolean
  discussionsPanel?: ReactNode
  pageSidebarOpen?: boolean
  pageSidebarPanel?: ReactNode
}) {
  const isMobile = useIsMobile()

  if (!isMobile) {
    return null
  }

  return (
    <>
      <div className="md:hidden">
        {pageSidebarPanel ? (
          <RightSidebarMobilePanel
            ariaLabel="Page sidebar"
            open={pageSidebarOpen}
          >
            {pageSidebarPanel}
          </RightSidebarMobilePanel>
        ) : null}
        {discussionsEnabled && discussionsPanel ? (
          <RightSidebarMobilePanel
            ariaLabel="Discussions sidebar"
            open={discussionsOpen}
            rightOffset={chatOpen}
          >
            {discussionsPanel}
          </RightSidebarMobilePanel>
        ) : null}
        <RightSidebarMobilePanel
          ariaLabel="Chat sidebar"
          open={chatOpen}
          zIndexClassName="z-50"
        >
          {chatPanel}
        </RightSidebarMobilePanel>
      </div>
    </>
  )
}
