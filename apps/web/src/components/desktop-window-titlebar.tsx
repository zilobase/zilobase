"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { CopyIcon, MinusIcon, SquareIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function isLinuxDesktopApp() {
  return isTauri() && navigator.userAgent.includes("Linux")
}

export function DesktopWindowTitlebar({
  children,
  className,
  variant,
}: {
  children: ReactNode
  className?: string
  variant: "fallback" | "tabs"
}) {
  const linuxDesktopApp = isLinuxDesktopApp()
  const [maximized, setMaximized] = useState(false)
  const appWindow = useMemo(() => getCurrentWindow(), [])

  const syncMaximizedState = useCallback(async () => {
    setMaximized(await appWindow.isMaximized())
  }, [appWindow])

  const toggleMaximize = useCallback(async () => {
    await appWindow.toggleMaximize()
    await syncMaximizedState()
  }, [appWindow, syncMaximizedState])

  useEffect(() => {
    if (!linuxDesktopApp) return

    let disposed = false
    let unlisten: (() => void) | undefined

    const updateMaximizedState = async () => {
      const nextMaximized = await appWindow.isMaximized()
      if (!disposed) setMaximized(nextMaximized)
    }

    void updateMaximizedState()
    void appWindow.onResized(() => void updateMaximizedState()).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [appWindow, linuxDesktopApp])

  const maximizeLabel = maximized ? "Restore window" : "Maximize window"

  return (
    <header
      className={cn(
        "absolute inset-x-0 top-0 z-30 flex h-9 shrink-0 items-center bg-sidebar px-1",
        variant === "fallback" && "border-b border-sidebar-border",
        className,
      )}
      data-desktop-fallback-titlebar={
        variant === "fallback" ? "" : undefined
      }
      data-desktop-tabs={variant === "tabs" ? "" : undefined}
      data-tauri-drag-region="deep"
      onMouseDown={(event) => {
        if (
          !linuxDesktopApp ||
          event.button !== 0 ||
          (event.target as HTMLElement).closest("button, [role=tablist]")
        ) {
          return
        }

        event.preventDefault()
        if (event.detail === 2) void toggleMaximize()
        else if (event.detail === 1) void appWindow.startDragging()
      }}
    >
      {children}
      {linuxDesktopApp ? (
        <div
          aria-label="Window controls"
          className="relative z-50 flex h-full shrink-0 items-stretch text-sidebar-foreground"
          role="group"
        >
          <button
            aria-label="Minimize window"
            className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => void appWindow.minimize()}
            title="Minimize"
            type="button"
          >
            <MinusIcon className="size-3.5" />
          </button>
          <button
            aria-label={maximizeLabel}
            className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => void toggleMaximize()}
            title={maximized ? "Restore" : "Maximize"}
            type="button"
          >
            {maximized ? (
              <CopyIcon className="size-3" />
            ) : (
              <SquareIcon className="size-3" />
            )}
          </button>
          <button
            aria-label="Close window"
            className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => void appWindow.close()}
            title="Close"
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ) : null}
    </header>
  )
}
