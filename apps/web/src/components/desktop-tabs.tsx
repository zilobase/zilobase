"use client"

import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { Reorder } from "framer-motion"
import {
  DatabaseIcon,
  FileTextIcon,
  HomeIcon,
  PlusIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { PageIconDisplay } from "@/lib/page-icon"
import { cn } from "@/lib/utils"
import { isOpenInNewTabShortcut } from "@/shortcuts"
import { useAppStore, type DesktopTab } from "@/stores/app-store"
import { DesktopWindowTitlebar } from "@/components/desktop-window-titlebar"
import { useSidebar } from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { hasEditorBlockDragData } from "@/packages/editor/components/editor/block-drag-session"

export function DesktopTabs({
  icon,
  title,
}: {
  icon?: string | null
  title: string
}) {
  const router = useRouter()
  const href = useRouterState({ select: (state) => state.location.href })
  const { isMobile, open: sidebarOpen } = useSidebar()
  const activeTabId = useAppStore((state) => state.activeDesktopTabId)
  const tabs = useAppStore((state) => state.desktopTabs)
  const activateTab = useAppStore((state) => state.activateDesktopTab)
  const closeTab = useAppStore((state) => state.closeDesktopTab)
  const openTab = useAppStore((state) => state.openDesktopTab)
  const setTabOrder = useAppStore((state) => state.setDesktopTabOrder)
  const syncTab = useAppStore((state) => state.syncDesktopTab)
  const desktopApp = isTauri()
  const macDesktopApp = desktopApp && navigator.userAgent.includes("Mac")

  useEffect(() => {
    if (desktopApp) syncTab({ href, icon, title })
  }, [desktopApp, href, icon, syncTab, title])

  const selectTab = useCallback(
    (tab: DesktopTab) => {
      if (tab.id === activeTabId) return
      activateTab(tab.id)
      router.history.push(tab.href)
    },
    [activateTab, activeTabId, router.history],
  )
  const openRouteInTab = useCallback(
    (input: Omit<DesktopTab, "id">) => {
      const tab = openTab(input)
      router.history.push(tab.href)
    },
    [openTab, router.history],
  )
  const createTab = useCallback(() => {
    openRouteInTab({ href: "/dashboard", icon: null, title: "Home" })
  }, [openRouteInTab])
  const removeTab = useCallback(
    (tabId: string) => {
      const wasActive = tabId === activeTabId
      const nextTab = closeTab(tabId)

      if (wasActive && nextTab) router.history.push(nextTab.href)
    },
    [activeTabId, closeTab, router.history],
  )

  useEffect(() => {
    if (!desktopApp) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return

      if (event.key.toLowerCase() === "t") {
        event.preventDefault()
        createTab()
      } else if (event.key.toLowerCase() === "w" && activeTabId) {
        event.preventDefault()
        removeTab(activeTabId)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeTabId, createTab, desktopApp, removeTab])

  useEffect(() => {
    if (!desktopApp) return

    const handleOpenInNewTab = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        !isOpenInNewTabShortcut(event) ||
        !(event.target instanceof Element)
      ) {
        return
      }

      const target = event.target.closest<HTMLElement>(
        "a[href], [data-open-in-new-tab-href]",
      )
      if (!target || (target instanceof HTMLAnchorElement && target.download)) {
        return
      }

      const rawHref =
        target.dataset.openInNewTabHref ?? target.getAttribute("href")
      if (!rawHref) return

      const url = new URL(rawHref, window.location.href)
      if (url.origin !== window.location.origin) return

      const route = `${url.pathname}${url.search}${url.hash}`
      const label =
        target.dataset.openInNewTabTitle ||
        target.textContent?.trim() ||
        target.getAttribute("title") ||
        getDesktopTabTitle(url.pathname)

      event.preventDefault()
      event.stopImmediatePropagation()
      openRouteInTab({ href: route, icon: null, title: label })
    }

    window.addEventListener("click", handleOpenInNewTab, true)
    return () => window.removeEventListener("click", handleOpenInNewTab, true)
  }, [desktopApp, openRouteInTab])

  if (!desktopApp) return null

  return (
    <DesktopWindowTitlebar
      className={cn(
        macDesktopApp && (isMobile || !sidebarOpen) && "pl-20",
      )}
      variant="tabs"
    >
      <div
        className="flex min-w-0 max-w-full shrink items-end gap-1 self-stretch pt-1"
        data-desktop-tab-strip
        style={
          {
            "--desktop-tab-count": Math.max(tabs.length, 1),
          } as CSSProperties
        }
      >
        <Reorder.Group
          aria-label="Open tabs"
          as="div"
          axis="x"
          className="flex min-w-0 flex-1 self-stretch items-end gap-1 overflow-hidden"
          data-tauri-drag-region="deep"
          onReorder={setTabOrder}
          role="tablist"
          values={tabs.map((tab) => tab.id)}
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTabId

            return (
              <Reorder.Item
                as="div"
                className={cn(
                  "group/tab relative flex min-w-12 max-w-60 flex-[1_1_15rem] cursor-grab items-center px-1 text-sm active:cursor-grabbing",
                  active
                    ? "desktop-tab-active z-10 h-8 rounded-t-lg rounded-b-none border-x border-t border-border/60 bg-background text-foreground"
                    : "h-8 rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
                dragMomentum={false}
                key={tab.id}
                onDragEnter={(event) => {
                  if (hasEditorBlockDragData(event.dataTransfer)) selectTab(tab)
                }}
                value={tab.id}
                whileDrag={{ zIndex: 30 }}
              >
                <DesktopTabButton
                  active={active}
                  onClone={() =>
                    openRouteInTab({
                      href: tab.href,
                      icon: tab.icon,
                      title: tab.title,
                    })
                  }
                  onRemove={() => removeTab(tab.id)}
                  onSelect={() => selectTab(tab)}
                  tab={tab}
                />
                <button
                  aria-label={`Close ${tab.title}`}
                  className={cn(
                    "shrink-0 rounded-sm p-1 hover:bg-muted focus-visible:opacity-100",
                    active
                      ? "opacity-100"
                      : "opacity-0 group-hover/tab:opacity-100",
                  )}
                  onClick={() => removeTab(tab.id)}
                  title="Close tab"
                  type="button"
                >
                  <XIcon className="size-3.5" />
                </button>
              </Reorder.Item>
            )
          })}
        </Reorder.Group>
        <button
          aria-label="New tab"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground"
          onClick={createTab}
          title={`New tab (${macDesktopApp ? "⌘T" : "Ctrl+T"})`}
          type="button"
        >
          <PlusIcon className="size-4" />
        </button>
      </div>
      <div
        className="min-w-0 flex-1 self-stretch"
        data-tauri-drag-region="deep"
      />
    </DesktopWindowTitlebar>
  )
}

function DesktopTabButton({
  active,
  onClone,
  onRemove,
  onSelect,
  tab,
}: {
  active: boolean
  onClone: () => void
  onRemove: () => void
  onSelect: () => void
  tab: DesktopTab
}) {
  const titleRef = useRef<HTMLSpanElement>(null)
  const [titleTruncated, setTitleTruncated] = useState(false)

  useEffect(() => {
    const titleElement = titleRef.current
    if (!titleElement) return

    const updateTruncatedState = () => {
      setTitleTruncated(titleElement.scrollWidth > titleElement.clientWidth)
    }
    const observer = new ResizeObserver(updateTruncatedState)

    updateTruncatedState()
    observer.observe(titleElement)
    return () => observer.disconnect()
  }, [tab.title])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-selected={active}
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-2"
          onAuxClick={(event) => {
            if (event.button === 1) onRemove()
          }}
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
            if (isOpenInNewTabShortcut(event)) {
              event.preventDefault()
              event.stopPropagation()
              onClone()
              return
            }

            onSelect()
          }}
          role="tab"
          type="button"
        >
          <DesktopTabIcon tab={tab} />
          <span className="min-w-0 flex-1 truncate" ref={titleRef}>
            {tab.title}
          </span>
        </button>
      </TooltipTrigger>
      {titleTruncated ? (
        <TooltipContent side="bottom" sideOffset={6}>
          {tab.title}
        </TooltipContent>
      ) : null}
    </Tooltip>
  )
}

export function useOpenInNewTab() {
  const router = useRouter()
  const openTab = useAppStore((state) => state.openDesktopTab)

  return useCallback(
    ({ href, title }: { href: string; title: string }) => {
      if (!isTauri()) {
        window.open(href, "_blank", "noopener")
        return
      }

      const tab = openTab({ href, icon: null, title })
      router.history.push(tab.href)
    },
    [openTab, router.history],
  )
}

export function getDesktopTabTitle(pathname: string) {
  if (pathname === "/dashboard") return "Home"
  if (pathname === "/ai") return "Ask AI"
  if (pathname === "/canvas") return "Canvas"
  if (pathname === "/trash") return "Trash"
  if (pathname.startsWith("/settings")) return "Settings"
  if (pathname.startsWith("/d/")) return "Database"
  if (pathname.startsWith("/p/")) return "Page"
  return "Zilobase"
}

function DesktopTabIcon({ tab }: { tab: DesktopTab }) {
  if (tab.icon) {
    return <PageIconDisplay className="size-4" size="sm" value={tab.icon} />
  }

  const Icon = tab.href.startsWith("/d/")
    ? DatabaseIcon
    : tab.href.startsWith("/p/")
      ? FileTextIcon
      : tab.href.startsWith("/settings")
        ? Settings2Icon
        : tab.href.startsWith("/ai")
          ? SparklesIcon
          : tab.href.startsWith("/trash")
            ? Trash2Icon
            : HomeIcon

  return <Icon className="size-4 shrink-0" />
}
