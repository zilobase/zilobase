import type {
  LibraryView,
  SidebarSection,
  SidebarSectionKind,
  SidebarShortcut,
  SidebarTab,
  SidebarWorkspaceLayout,
} from "@zilobase/features/user-settings"

export const sidebarSectionLabels: Record<SidebarSectionKind, string> = {
  aiChats: "AI chats",
  databaseView: "Database view",
  favorites: "Favorites",
  meetings: "Meetings",
  private: "Private",
  recents: "Recents",
  shared: "Shared & teamspaces",
  tasks: "Tasks",
}

export const libraryViewLabels: Record<LibraryView, string> = {
  favourites: "Favorites",
  meetings: "Meetings",
  private: "Private",
  recents: "Recents",
  shared: "Shared",
  teamspaces: "Teamspaces",
}

export function getShortcutLabel(shortcut: SidebarShortcut) {
  if (shortcut.label) return shortcut.label
  const target = shortcut.target
  if (target.type === "action") {
    return target.action === "createPage"
      ? "New page"
      : target.action === "createDatabase"
        ? "New database"
        : "New AI chat"
  }
  if (target.type === "route") {
    return {
      ai: "Ask AI",
      meetings: "Meetings",
      settings: "Settings",
      tasks: "Tasks",
      trash: "Trash",
    }[target.route]
  }
  if (target.type === "library") return libraryViewLabels[target.view]
  return target.type === "page" ? "Page" : "Database"
}

export function getSectionLabel(section: SidebarSection) {
  return section.label || sidebarSectionLabels[section.kind]
}

export function updateSidebarTab(
  layout: SidebarWorkspaceLayout,
  tabId: string,
  update: (tab: SidebarTab) => SidebarTab,
): SidebarWorkspaceLayout {
  return {
    ...layout,
    tabs: layout.tabs.map((tab) => (tab.id === tabId ? update(tab) : tab)),
  }
}

export function moveArrayItem<T>(items: T[], index: number, offset: -1 | 1) {
  const nextIndex = index + offset
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  ;[next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!]
  return next
}

export function moveLayoutEntry(
  layout: SidebarWorkspaceLayout,
  sourceTabId: string,
  targetTabId: string,
  entryType: "sections" | "shortcuts",
  entryId: string,
) {
  if (sourceTabId === targetTabId) return layout
  const source = layout.tabs.find((tab) => tab.id === sourceTabId)
  const entry = source?.[entryType].find((item) => item.id === entryId)
  if (!entry) return layout

  return {
    ...layout,
    tabs: layout.tabs.map((tab) => {
      if (tab.id === sourceTabId) {
        return { ...tab, [entryType]: tab[entryType].filter((item) => item.id !== entryId) }
      }
      if (tab.id === targetTabId) {
        return { ...tab, [entryType]: [...tab[entryType], entry] }
      }
      return tab
    }),
  }
}

export function hasShortcutTarget(tab: SidebarTab, target: SidebarShortcut["target"]) {
  return tab.shortcuts.some((shortcut) =>
    JSON.stringify(shortcut.target) === JSON.stringify(target),
  )
}
