export const libraryViewIds = [
  "recents",
  "favourites",
  "meetings",
  "shared",
  "teamspaces",
  "private",
] as const

export const sidebarSectionIds = ["recents", "favorites", "private", "shared"] as const
export const sidebarItemIds = [
  "askAi", "meetings", "tasks", ...sidebarSectionIds,
  "calendar", "templates", "trash", "help",
] as const
export const sidebarSectionLimits = [5, 10, 15, 20, 50, 100] as const
export const sidebarSectionSorts = ["lastEdited", "alphabetical"] as const
export const sidebarTabIconIds = [
  "home", "circle", "star", "briefcase", "folder", "list",
  "calendar", "sparkles", "database",
] as const
export const sidebarSectionKinds = [
  "favorites", "recents", "private", "shared", "teamspaces", "meetings",
  "aiChats", "tasks", "databaseView",
] as const

export type LibraryView = (typeof libraryViewIds)[number]
export type SidebarItemId = (typeof sidebarItemIds)[number]
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
    | { action: "createPage" | "createDatabase" | "createChat"; type: "action" }
    | { route: "ai" | "meetings" | "tasks" | "trash" | "settings"; type: "route" }
    | { type: "library"; view: LibraryView }
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

/** @deprecated Only used by pre-v2 sidebar presentation components. */
export type LegacySidebarConfig = {
  hiddenItems: SidebarItemId[]
  libraryView: LibraryView
  sectionLimits: Record<SidebarSectionId, SidebarSectionLimit>
  sectionOrder: SidebarSectionId[]
  sectionSorts: Record<SidebarSectionId, SidebarSectionSort>
  taskDatabaseIds: string[]
}

const defaultSections: SidebarSection[] = [
  { id: "default-recents", kind: "recents", limit: 10, sort: "lastEdited" },
  { id: "default-favorites", kind: "favorites", limit: 10, sort: "lastEdited" },
  { id: "default-private", kind: "private", limit: 10, sort: "lastEdited" },
  { id: "default-shared", kind: "shared", limit: 10, sort: "lastEdited" },
  { id: "default-teamspaces", kind: "teamspaces", limit: 10, sort: "lastEdited" },
]

const defaultShortcuts: SidebarShortcut[] = [
  { id: "default-ask-ai", target: { route: "ai", type: "route" } },
  { id: "default-meetings", target: { route: "meetings", type: "route" } },
  { id: "default-tasks", target: { route: "tasks", type: "route" } },
  { id: "default-library", target: { type: "library", view: "recents" } },
  { id: "default-trash", target: { route: "trash", type: "route" } },
]

export const defaultSidebarWorkspaceLayout: SidebarWorkspaceLayout = {
  tabs: [{
    icon: "home",
    id: "home",
    name: "Home",
    sections: defaultSections,
    shortcuts: defaultShortcuts,
  }],
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
  if (Object.keys(config).length === 0) {
    return {
      ...defaultSidebarConfig,
      defaultLayout: cloneSidebarWorkspaceLayout(defaultSidebarWorkspaceLayout),
      workspaceLayouts: {},
    }
  }
  if (config.version === 2) return migrateCombinedSidebarSections(config)
  if (config.version !== 3) return migrateLegacySidebarConfig(config)

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
    ? { ...configuredHome, icon: "home", id: "home", name: "Home" }
    : cloneSidebarWorkspaceLayout(defaultSidebarWorkspaceLayout).tabs[0]!

  return {
    tabs: [home, ...tabs.filter((tab) => tab.id !== "home")].slice(0, 8),
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

  if (target.type === "action" && isIncluded(target.action, ["createPage", "createDatabase", "createChat"] as const)) {
    normalizedTarget = { action: target.action, type: "action" }
  } else if (target.type === "route" && isIncluded(target.route, ["ai", "meetings", "tasks", "trash", "settings"] as const)) {
    normalizedTarget = { route: target.route, type: "route" }
  } else if (target.type === "library" && isIncluded(target.view, libraryViewIds)) {
    normalizedTarget = { type: "library", view: target.view }
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

function migrateLegacySidebarConfig(config: Record<string, unknown>): SidebarConfig {
  const hiddenItems = new Set(uniqueValidValues(config.hiddenItems, sidebarItemIds))
  const limits = isRecord(config.sectionLimits) ? config.sectionLimits : {}
  const sorts = isRecord(config.sectionSorts) ? config.sectionSorts : {}
  const sections = completeLegacySectionOrder(config.sectionOrder)
    .filter((kind) => !hiddenItems.has(kind))
    .map((kind) => ({
      id: `default-${kind}`,
      kind,
      limit: isIncluded(limits[kind], sidebarSectionLimits) ? limits[kind] : 10,
      sort: isIncluded(sorts[kind], sidebarSectionSorts) ? sorts[kind] : "lastEdited",
    })) satisfies SidebarSection[]
  const routeItems = ["askAi", "meetings", "tasks", "trash"] as const
  const shortcuts = routeItems
    .filter((item) => !hiddenItems.has(item))
    .map((item) => ({
      id: `default-${item.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`,
      target: { route: item === "askAi" ? "ai" : item, type: "route" },
    })) as SidebarShortcut[]
  shortcuts.splice(3, 0, { id: "default-library", target: { type: "library", view: "recents" } })

  return {
    defaultLayout: normalizeSidebarWorkspaceLayout({
      tabs: [{ icon: "home", id: "home", name: "Home", sections: splitCombinedSections(sections), shortcuts }],
      taskDatabaseIds: uniqueStrings(config.taskDatabaseIds).slice(0, 10),
    }),
    libraryView: isIncluded(config.libraryView, libraryViewIds) ? config.libraryView : "recents",
    version: 3,
    workspaceLayouts: {},
  }
}

function migrateCombinedSidebarSections(config: Record<string, unknown>): SidebarConfig {
  const migrateLayout = (value: unknown) => {
    const layout = normalizeSidebarWorkspaceLayout(value)
    return {
      ...layout,
      tabs: layout.tabs.map((tab) => ({
        ...tab,
        sections: splitCombinedSections(tab.sections),
      })),
    }
  }
  const layouts = isRecord(config.workspaceLayouts) ? config.workspaceLayouts : {}
  return {
    defaultLayout: migrateLayout(config.defaultLayout),
    libraryView: isIncluded(config.libraryView, libraryViewIds) ? config.libraryView : "recents",
    version: 3,
    workspaceLayouts: Object.fromEntries(
      Object.entries(layouts)
        .filter(([workspaceId]) => isSafeId(workspaceId))
        .slice(0, 64)
        .map(([workspaceId, layout]) => [workspaceId, migrateLayout(layout)]),
    ),
  }
}

function splitCombinedSections(sections: SidebarSection[]): SidebarSection[] {
  if (sections.some((section) => section.kind === "teamspaces")) return sections
  const shared = sections.find((section) => section.kind === "shared")
  if (!shared || shared.kind === "databaseView") return sections
  const sharedIndex = sections.indexOf(shared)
  const ids = new Set(sections.map((section) => section.id))
  let id = "migrated-teamspaces"
  let suffix = 2
  while (ids.has(id)) id = `migrated-teamspaces-${suffix++}`
  const next = [...sections]
  next.splice(sharedIndex + 1, 0, {
    id,
    kind: "teamspaces",
    limit: shared.limit,
    sort: shared.sort,
  })
  return next
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

function completeLegacySectionOrder(value: unknown): SidebarSectionId[] {
  const configured = uniqueValidValues(value, sidebarSectionIds)
  return [...configured, ...sidebarSectionIds.filter((id) => !configured.includes(id))]
}

function uniqueById<T extends { id: string }>(items: Array<T | null>): T[] {
  const seen = new Set<string>()
  return items.filter((item): item is T => {
    if (!item || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function uniqueValidValues<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is T => isIncluded(item, allowed)))]
}

function isIncluded<T>(value: unknown, allowed: readonly T[]): value is T {
  return allowed.includes(value as T)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
