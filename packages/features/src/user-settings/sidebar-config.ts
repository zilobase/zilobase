export const libraryViewIds = [
  "recents",
  "favourites",
  "meetings",
  "skills",
  "instructions",
  "shared",
  "teamspaces",
  "private",
] as const

export const mailViewIds = [
  "inbox",
  "unread",
  "starred",
  "sent",
  "drafts",
  "archive",
  "spam",
  "trash",
] as const

export const sidebarSectionIds = ["recents", "favorites", "private", "shared"] as const
export const sidebarSectionLimits = [5, 10, 15, 20, 50, 100] as const
export const sidebarSectionSorts = ["lastEdited", "alphabetical"] as const
export const sidebarTabIconIds = [
  "home", "circle", "star", "briefcase", "folder", "list",
  "calendar", "sparkles", "database", "mail",
] as const
export const sidebarSectionKinds = [
  "favorites", "recents", "private", "shared", "teamspaces", "meetings",
  "aiChats", "tasks", "databaseView",
] as const

export type LibraryView = (typeof libraryViewIds)[number]
export type MailView = (typeof mailViewIds)[number]
export type SidebarSectionId = (typeof sidebarSectionIds)[number]
export type SidebarSectionKind = (typeof sidebarSectionKinds)[number]
export type SidebarSectionLimit = (typeof sidebarSectionLimits)[number]
export type SidebarSectionSort = (typeof sidebarSectionSorts)[number]
export type SidebarTabIconId = (typeof sidebarTabIconIds)[number]

export type SidebarShortcut = {
  icon?: string
  id: string
  label?: string
  target:
    | { action: "composeMail" | "createPage" | "createDatabase" | "createChat"; type: "action" }
    | { route: "ai" | "meetings" | "tasks" | "trash" | "settings"; type: "route" }
    | { type: "library"; view: LibraryView }
    | { type: "mail"; view: MailView }
    | { pageId: string; type: "page" }
    | { databaseId: string; type: "database"; viewId?: string }
}

type SidebarSectionBase = {
  id: string
  label?: string
  limit: SidebarSectionLimit
}

export type SidebarSection =
  | (SidebarSectionBase & {
      kind: Exclude<SidebarSectionKind, "databaseView">
      sort: SidebarSectionSort
    })
  | (SidebarSectionBase & {
      databaseId: string
      kind: "databaseView"
      showPageIcon: boolean
      viewId?: string
    })

export type SidebarTab = {
  icon: string
  id: string
  name: string
  sections: SidebarSection[]
  shortcuts: SidebarShortcut[]
}

export type SidebarWorkspaceLayout = {
  tabs: SidebarTab[]
  taskDatabaseIds: string[]
}

export type SidebarConfig = {
  defaultLayout: SidebarWorkspaceLayout
  libraryView: LibraryView
  version: 3
  workspaceLayouts: Record<string, SidebarWorkspaceLayout>
}

const defaultSections: SidebarSection[] = [
  { id: "default-recents", kind: "recents", limit: 10, sort: "lastEdited" },
  { id: "default-favorites", kind: "favorites", limit: 10, sort: "lastEdited" },
  { id: "default-private", kind: "private", limit: 10, sort: "lastEdited" },
  { id: "default-shared", kind: "shared", limit: 10, sort: "lastEdited" },
  { id: "default-teamspaces", kind: "teamspaces", limit: 10, sort: "lastEdited" },
]

const defaultShortcuts: SidebarShortcut[] = [
  { id: "default-meetings", target: { route: "meetings", type: "route" } },
  { id: "default-tasks", target: { route: "tasks", type: "route" } },
  { id: "default-library", target: { type: "library", view: "recents" } },
  { id: "default-trash", target: { route: "trash", type: "route" } },
]

const defaultAiShortcuts: SidebarShortcut[] = [
  { id: "default-ai-new-chat", target: { action: "createChat", type: "action" } },
]

const defaultAiSections: SidebarSection[] = [
  { id: "default-ai-chats", kind: "aiChats", limit: 50, sort: "lastEdited" },
]

const defaultMailComposeShortcut: SidebarShortcut = {
  id: "default-mail-compose",
  target: { action: "composeMail", type: "action" },
}

const defaultMailShortcuts: SidebarShortcut[] = [
  defaultMailComposeShortcut,
  ...mailViewIds.map((view) => ({
    id: `default-mail-${view}`,
    target: { type: "mail" as const, view },
  })),
]

export const defaultSidebarWorkspaceLayout: SidebarWorkspaceLayout = {
  tabs: [
    {
      icon: "home",
      id: "home",
      name: "Home",
      sections: defaultSections,
      shortcuts: defaultShortcuts,
    },
    {
      icon: "sparkles",
      id: "ai",
      name: "AI",
      sections: defaultAiSections,
      shortcuts: defaultAiShortcuts,
    },
    {
      icon: "mail",
      id: "mail",
      name: "Mail",
      sections: [],
      shortcuts: defaultMailShortcuts,
    },
    { icon: "calendar", id: "calendar", name: "Calendar", sections: [], shortcuts: [] },
  ],
  taskDatabaseIds: [],
}

export const defaultSidebarConfig: SidebarConfig = {
  defaultLayout: defaultSidebarWorkspaceLayout,
  libraryView: "recents",
  version: 3,
  workspaceLayouts: {},
}

export function normalizeSidebarConfig(value: unknown): SidebarConfig {
  const config = isRecord(value) ? value : {}
  if (config.version !== 3) {
    return {
      ...defaultSidebarConfig,
      defaultLayout: cloneSidebarWorkspaceLayout(defaultSidebarWorkspaceLayout),
      workspaceLayouts: {},
    }
  }

  const layouts = isRecord(config.workspaceLayouts) ? config.workspaceLayouts : {}
  return {
    defaultLayout: normalizeSidebarWorkspaceLayout(config.defaultLayout),
    libraryView: isIncluded(config.libraryView, libraryViewIds)
      ? config.libraryView
      : defaultSidebarConfig.libraryView,
    version: 3,
    workspaceLayouts: Object.fromEntries(
      Object.entries(layouts)
        .filter(([workspaceId]) => isSafeId(workspaceId))
        .slice(0, 64)
        .map(([workspaceId, layout]) => [workspaceId, normalizeSidebarWorkspaceLayout(layout)]),
    ),
  }
}

export function resolveSidebarWorkspaceLayout(
  config: SidebarConfig,
  workspaceId: string | null | undefined,
): SidebarWorkspaceLayout {
  return workspaceId && config.workspaceLayouts[workspaceId]
    ? config.workspaceLayouts[workspaceId]
    : config.defaultLayout
}

export function withSidebarWorkspaceLayout(
  config: SidebarConfig,
  workspaceId: string,
  layout: SidebarWorkspaceLayout,
): SidebarConfig {
  return normalizeSidebarConfig({
    ...config,
    workspaceLayouts: { ...config.workspaceLayouts, [workspaceId]: layout },
  })
}

export function normalizeSidebarWorkspaceLayout(value: unknown): SidebarWorkspaceLayout {
  const layout = isRecord(value) ? value : {}
  const configuredTabs = Array.isArray(layout.tabs)
    ? layout.tabs.map(normalizeSidebarTab).filter(Boolean).slice(0, 8)
    : []
  const tabs = uniqueById(configuredTabs)
  const configuredHome = tabs.find((tab) => tab.id === "home")
  const home = configuredHome
    ? normalizeWorkspaceTab({ ...configuredHome, icon: "home", id: "home", name: "Home" })
    : cloneSidebarWorkspaceLayout(defaultSidebarWorkspaceLayout).tabs[0]!
  const configuredAi = tabs.find((tab) => tab.id === "ai")
  const ai = configuredAi
    ? {
        ...configuredAi,
        icon: "sparkles",
        id: "ai",
        name: "AI",
        sections: configuredAi.sections.filter((section) => section.kind === "aiChats"),
        shortcuts: configuredAi.shortcuts.filter(isAiShortcut),
      }
    : cloneSidebarWorkspaceLayout(defaultSidebarWorkspaceLayout).tabs[1]!
  const configuredMail = tabs.find((tab) => tab.id === "mail")
  const mail = configuredMail
    ? {
        ...configuredMail,
        icon: "mail",
        id: "mail",
        name: "Mail",
        sections: [],
        shortcuts: ensureMailComposeShortcut(configuredMail.shortcuts.filter(isMailShortcut)),
      }
    : cloneSidebarWorkspaceLayout(defaultSidebarWorkspaceLayout).tabs[2]!

  return {
    tabs: [
      home,
      ai,
      mail,
      { icon: "calendar", id: "calendar", name: "Calendar", sections: [], shortcuts: [] },
      ...tabs
        .filter((tab) => !isFixedSidebarTabId(tab.id))
        .map(normalizeWorkspaceTab),
    ].slice(0, 8),
    taskDatabaseIds: uniqueStrings(layout.taskDatabaseIds).slice(0, 10),
  }
}

export function cloneSidebarWorkspaceLayout(layout: SidebarWorkspaceLayout): SidebarWorkspaceLayout {
  return {
    tabs: layout.tabs.map((tab) => ({
      ...tab,
      sections: tab.sections.map((section) => ({ ...section })),
      shortcuts: tab.shortcuts.map((shortcut) => ({
        ...shortcut,
        target: { ...shortcut.target },
      })),
    })),
    taskDatabaseIds: [...layout.taskDatabaseIds],
  }
}

function normalizeSidebarTab(value: unknown): SidebarTab | null {
  if (!isRecord(value) || !isSafeId(value.id)) return null
  const shortcuts = Array.isArray(value.shortcuts)
    ? value.shortcuts.map(normalizeShortcut).filter(Boolean).slice(0, 24)
    : []
  const sections = Array.isArray(value.sections)
    ? value.sections.map(normalizeSection).filter(Boolean).slice(0, 24)
    : []

  return {
    icon: normalizeSidebarIcon(value.icon) ?? "circle",
    id: value.id,
    name: normalizeLabel(value.name) ?? "Untitled tab",
    sections: uniqueById(sections),
    shortcuts: uniqueById(shortcuts),
  }
}

function normalizeShortcut(value: unknown): SidebarShortcut | null {
  if (!isRecord(value) || !isSafeId(value.id) || !isRecord(value.target)) return null
  const target = value.target
  let normalizedTarget: SidebarShortcut["target"] | null = null

  if (target.type === "action" && isIncluded(target.action, ["composeMail", "createPage", "createDatabase", "createChat"] as const)) {
    normalizedTarget = { action: target.action, type: "action" }
  } else if (target.type === "route" && isIncluded(target.route, ["ai", "meetings", "tasks", "trash", "settings"] as const)) {
    normalizedTarget = { route: target.route, type: "route" }
  } else if (target.type === "library" && isIncluded(target.view, libraryViewIds)) {
    normalizedTarget = { type: "library", view: target.view }
  } else if (target.type === "mail" && isIncluded(target.view, mailViewIds)) {
    normalizedTarget = { type: "mail", view: target.view }
  } else if (target.type === "page" && isSafeId(target.pageId)) {
    normalizedTarget = { pageId: target.pageId, type: "page" }
  } else if (target.type === "database" && isSafeId(target.databaseId)) {
    normalizedTarget = {
      databaseId: target.databaseId,
      type: "database",
      ...(isSafeId(target.viewId) ? { viewId: target.viewId } : {}),
    }
  }

  const label = normalizeLabel(value.label)
  const icon = normalizeSidebarIcon(value.icon)
  return normalizedTarget
    ? { id: value.id, ...(icon ? { icon } : {}), ...(label ? { label } : {}), target: normalizedTarget }
    : null
}

export function isFixedSidebarTabId(tabId: string) {
  return tabId === "home" || tabId === "ai" || tabId === "mail" || tabId === "calendar"
}

export function isStaticSidebarTabId(tabId: string) {
  return tabId === "ai" || tabId === "mail" || tabId === "calendar"
}

export function isRequiredSidebarShortcut(tabId: string, shortcut: SidebarShortcut) {
  return tabId === "mail" &&
    shortcut.target.type === "action" &&
    shortcut.target.action === "composeMail"
}

function isAiShortcut(shortcut: SidebarShortcut) {
  const target = shortcut.target
  return (target.type === "action" && target.action === "createChat") ||
    (target.type === "route" && target.route === "ai")
}

function isMailShortcut(shortcut: SidebarShortcut) {
  const target = shortcut.target
  return target.type === "mail" ||
    (target.type === "action" && target.action === "composeMail")
}

function ensureMailComposeShortcut(shortcuts: SidebarShortcut[]) {
  return shortcuts.some((shortcut) => isRequiredSidebarShortcut("mail", shortcut))
    ? shortcuts
    : [{ ...defaultMailComposeShortcut, target: { ...defaultMailComposeShortcut.target } }, ...shortcuts].slice(0, 24)
}

function normalizeWorkspaceTab(tab: SidebarTab): SidebarTab {
  return {
    ...tab,
    sections: tab.sections.filter((section) => section.kind !== "aiChats"),
    shortcuts: tab.shortcuts.filter((shortcut) => {
      const target = shortcut.target
      if (target.type === "mail") return false
      if (target.type === "action") {
        return target.action !== "composeMail" && target.action !== "createChat"
      }
      return target.type !== "route" || target.route !== "ai"
    }),
  }
}

function normalizeSection(value: unknown): SidebarSection | null {
  if (!isRecord(value) || !isSafeId(value.id) || !isIncluded(value.kind, sidebarSectionKinds)) return null
  const label = normalizeLabel(value.label)
  const base = {
    id: value.id,
    ...(label ? { label } : {}),
    limit: isIncluded(value.limit, sidebarSectionLimits) ? value.limit : 10,
  }

  if (value.kind === "databaseView") {
    if (!isSafeId(value.databaseId)) return null
    return {
      ...base,
      databaseId: value.databaseId,
      kind: "databaseView",
      showPageIcon: value.showPageIcon !== false,
      ...(isSafeId(value.viewId) ? { viewId: value.viewId } : {}),
    }
  }

  return {
    ...base,
    kind: value.kind,
    sort: isIncluded(value.sort, sidebarSectionSorts) ? value.sort : "lastEdited",
  }
}

function normalizeSidebarIcon(value: unknown): string | undefined {
  if (isIncluded(value, sidebarTabIconIds)) return value
  if (
    typeof value === "string" &&
    value.length <= 8_192 &&
    value.trim().startsWith("<svg") &&
    value.trim().endsWith("</svg>") &&
    !/<script|on\w+=|javascript:/i.test(value)
  ) return value.trim()
  if (typeof value === "string" && value.length <= 16 && !/[<>]/.test(value)) return value
  return undefined
}

function normalizeLabel(value: unknown) {
  if (typeof value !== "string") return undefined
  const label = value.trim().slice(0, 40)
  return label || undefined
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isSafeId))]
}

function uniqueById<T extends { id: string }>(items: Array<T | null>): T[] {
  const seen = new Set<string>()
  return items.filter((item): item is T => {
    if (!item || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function isIncluded<T>(value: unknown, allowed: readonly T[]): value is T {
  return allowed.includes(value as T)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
