import { create } from "zustand"
import { persist } from "zustand/middleware"

import { desktopPersistOptions } from "@/features/desktop/persistence/index"

export type DesktopTab = {
  href: string
  icon?: string | null
  id: string
  title: string
}

type DesktopTabState = {
  activeDesktopTabId: string | null
  desktopTabs: DesktopTab[]
}

type AppState = {
  activeWorkspaceId: string | null
  activateDesktopTab: (tabId: string) => void
  closeDesktopTab: (tabId: string) => DesktopTab | null
  openDesktopTab: (tab: Omit<DesktopTab, "id">) => DesktopTab
  resetAccountState: () => void
  setDesktopTabOrder: (orderedTabIds: string[]) => void
  setActiveWorkspaceId: (workspaceId: string | null) => void
  syncDesktopTab: (tab: Omit<DesktopTab, "id">) => void
} & DesktopTabState

export function closeDesktopTabState(
  state: DesktopTabState,
  tabId: string,
): DesktopTabState {
  const closingIndex = state.desktopTabs.findIndex((tab) => tab.id === tabId)

  if (closingIndex < 0) return state

  if (state.desktopTabs.length === 1) {
    return {
      activeDesktopTabId: tabId,
      desktopTabs: [
        { href: "/recents", icon: null, id: tabId, title: "Recents" },
      ],
    }
  }

  const desktopTabs = state.desktopTabs.filter((tab) => tab.id !== tabId)
  const activeDesktopTabId =
    state.activeDesktopTabId === tabId
      ? desktopTabs[Math.min(closingIndex, desktopTabs.length - 1)].id
      : state.activeDesktopTabId

  return { activeDesktopTabId, desktopTabs }
}

export function setDesktopTabOrderState(
  state: DesktopTabState,
  orderedTabIds: string[],
): DesktopTabState {
  if (
    orderedTabIds.length !== state.desktopTabs.length ||
    new Set(orderedTabIds).size !== orderedTabIds.length
  ) {
    return state
  }

  const tabsById = new Map(state.desktopTabs.map((tab) => [tab.id, tab]))
  const desktopTabs: DesktopTab[] = []

  for (const tabId of orderedTabIds) {
    const tab = tabsById.get(tabId)
    if (!tab) return state
    desktopTabs.push(tab)
  }

  return { ...state, desktopTabs }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeDesktopTabId: null,
      activeWorkspaceId: null,
      desktopTabs: [],
      activateDesktopTab: (activeDesktopTabId) => set({ activeDesktopTabId }),
      closeDesktopTab: (tabId) => {
        const next = closeDesktopTabState(get(), tabId)
        set(next)
        return (
          next.desktopTabs.find((tab) => tab.id === next.activeDesktopTabId) ??
          null
        )
      },
      openDesktopTab: (input) => {
        const tab = { ...input, id: crypto.randomUUID() }
        set((state) => ({
          activeDesktopTabId: tab.id,
          desktopTabs: [...state.desktopTabs, tab],
        }))
        return tab
      },
      resetAccountState: () =>
        set({
          activeDesktopTabId: null,
          activeWorkspaceId: null,
          desktopTabs: [],
        }),
      setDesktopTabOrder: (orderedTabIds) =>
        set((state) => setDesktopTabOrderState(state, orderedTabIds)),
      setActiveWorkspaceId: (activeWorkspaceId) => set({ activeWorkspaceId }),
      syncDesktopTab: (input) =>
        set((state) => {
          const activeIndex = state.desktopTabs.findIndex(
            (tab) => tab.id === state.activeDesktopTabId,
          )

          if (activeIndex < 0) {
            const tab = { ...input, id: crypto.randomUUID() }
            return {
              activeDesktopTabId: tab.id,
              desktopTabs: [...state.desktopTabs, tab],
            }
          }

          return {
            desktopTabs: state.desktopTabs.map((tab, index) =>
              index === activeIndex ? { ...tab, ...input } : tab,
            ),
          }
        }),
    }),
    desktopPersistOptions("zilobase-app"),
  ),
)
