"use client"

import { useCallback, useEffect, useRef } from "react"
import { isDesktopApp } from "@/platform/desktop/native"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { useShallow } from "zustand/react/shallow"

import { cn } from "@/shared/lib/utils"
import { isOpenInNewTabShortcut } from "@/shared/shortcuts"
import { useAppStore, type DesktopTab } from "@/features/desktop/state/app-store"
import { DesktopTabStrip } from "./desktop-tab-strip"
import { DesktopWindowTitlebar } from "./desktop-window-titlebar"
import { useSidebar } from "@/shared/ui/sidebar"

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
  const {
    activeTabId,
    activateTab,
    closeTab,
    openTab,
    setTabOrder,
    syncTab,
    tabs,
  } = useAppStore(
    useShallow((state) => ({
      activeTabId: state.activeDesktopTabId,
      activateTab: state.activateDesktopTab,
      closeTab: state.closeDesktopTab,
      openTab: state.openDesktopTab,
      setTabOrder: state.setDesktopTabOrder,
      syncTab: state.syncDesktopTab,
      tabs: state.desktopTabs,
    })),
  )
  const desktopApp = isDesktopApp()
  const macDesktopApp = desktopApp && navigator.userAgent.includes("Mac")
  const pendingNavigation = useRef<{ from: string; to: string } | null>(null)

  useEffect(() => {
    if (!desktopApp) return
    const pending = pendingNavigation.current
    if (pending && href === pending.from && href !== pending.to) return
    pendingNavigation.current = null
    syncTab({ href, icon, title })
  }, [desktopApp, href, icon, syncTab, title])

  const selectTab = useCallback(
    (tab: DesktopTab) => {
      if (tab.id === useAppStore.getState().activeDesktopTabId) return
      pendingNavigation.current = { from: href, to: tab.href }
      activateTab(tab.id)
      router.history.push(tab.href)
    },
    [activateTab, href, router.history],
  )
  const openRouteInTab = useCallback(
    (input: Omit<DesktopTab, "id">) => {
      pendingNavigation.current = { from: href, to: input.href }
      const tab = openTab(input)
      router.history.push(tab.href)
    },
    [href, openTab, router.history],
  )
  const createTab = useCallback(() => {
    openRouteInTab({ href: "/recents", icon: null, title: "Recents" })
  }, [openRouteInTab])
  const removeTab = useCallback(
    (tabId: string) => {
      const wasActive = tabId === activeTabId
      const nextTab = closeTab(tabId)

      if (wasActive && nextTab && nextTab.href !== href) {
        pendingNavigation.current = { from: href, to: nextTab.href }
        router.history.push(nextTab.href)
      }
    },
    [activeTabId, closeTab, href, router.history],
  )
  const cloneTab = useCallback(
    (tab: DesktopTab) =>
      openRouteInTab({ href: tab.href, icon: tab.icon, title: tab.title }),
    [openRouteInTab],
  )
  const preloadTab = useCallback(
    (tab: DesktopTab) => {
      if (tab.id !== useAppStore.getState().activeDesktopTabId) {
        void router.preloadRoute({ to: tab.href }).catch(() => {})
      }
    },
    [router],
  )

  useDesktopTabShortcuts({
    activeTabId,
    createTab,
    desktopApp,
    removeTab,
    selectTab,
    tabs,
  })
  useDesktopOpenInNewTabCapture({ desktopApp, openRouteInTab })

  if (!desktopApp) return null

  return (
    <DesktopWindowTitlebar
      className={cn(
        macDesktopApp && (isMobile || !sidebarOpen) && "pl-20",
      )}
      variant="tabs"
    >
      <DesktopTabStrip
        activeTabId={activeTabId}
        macDesktopApp={macDesktopApp}
        onCloneTab={cloneTab}
        onCreateTab={createTab}
        onPreloadTab={preloadTab}
        onRemoveTab={removeTab}
        onReorderTabs={setTabOrder}
        onSelectTab={selectTab}
        tabs={tabs}
      />
      <div
        className="min-w-0 flex-1 self-stretch"
        data-desktop-drag-region=""
      />
    </DesktopWindowTitlebar>
  )
}

function useDesktopTabShortcuts({
  activeTabId,
  createTab,
  desktopApp,
  removeTab,
  selectTab,
  tabs,
}: {
  activeTabId: string | null
  createTab: () => void
  desktopApp: boolean
  removeTab: (tabId: string) => void
  selectTab: (tab: DesktopTab) => void
  tabs: DesktopTab[]
}) {
  useEffect(() => {
    if (!desktopApp) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key === "Tab"
      ) {
        event.preventDefault()
        const index = tabs.findIndex((tab) => tab.id === activeTabId)
        const nextIndex =
          (index + (event.shiftKey ? -1 : 1) + tabs.length) % tabs.length
        if (tabs[nextIndex]) selectTab(tabs[nextIndex])
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return

      if (!event.shiftKey && /^[1-9]$/.test(event.key)) {
        const index = event.key === "9" ? tabs.length - 1 : Number(event.key) - 1
        if (tabs[index]) {
          event.preventDefault()
          selectTab(tabs[index])
        }
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault()
        createTab()
      } else if (event.key.toLowerCase() === "w" && activeTabId) {
        event.preventDefault()
        removeTab(activeTabId)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeTabId, createTab, desktopApp, removeTab, selectTab, tabs])
}

function useDesktopOpenInNewTabCapture({
  desktopApp,
  openRouteInTab,
}: {
  desktopApp: boolean
  openRouteInTab: (input: Omit<DesktopTab, "id">) => void
}) {
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
}

export function useOpenInNewTab() {
  const router = useRouter()
  const openTab = useAppStore((state) => state.openDesktopTab)

  return useCallback(
    ({ href, title }: { href: string; title: string }) => {
      if (!isDesktopApp()) {
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
  if (pathname === "/recents") return "Recents"
  if (pathname === "/mail") return "Mail"
  if (pathname === "/ai") return "Ask AI"
  if (pathname === "/tasks") return "Tasks"
  if (pathname === "/canvas") return "Canvas"
  if (pathname === "/trash") return "Trash"
  if (pathname.startsWith("/settings")) return "Settings"
  if (pathname.startsWith("/d/")) return "Database"
  if (pathname.startsWith("/m/")) return "Meeting"
  if (pathname.startsWith("/p/")) return "Page"
  return "Zilobase"
}
