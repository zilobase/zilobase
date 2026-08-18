export const libraryViewIds = [
  "recents",
  "favourites",
  "shared",
  "private",
] as const

export const sidebarSectionIds = [
  "recents",
  "favorites",
  "private",
  "shared",
] as const

export const sidebarItemIds = [
  "askAi",
  "meetings",
  ...sidebarSectionIds,
  "calendar",
  "templates",
  "trash",
  "help",
] as const

export const sidebarSectionLimits = [5, 10, 20, 50] as const
export const sidebarSectionSorts = ["lastEdited", "alphabetical"] as const

export type LibraryView = (typeof libraryViewIds)[number]
export type SidebarItemId = (typeof sidebarItemIds)[number]
export type SidebarSectionId = (typeof sidebarSectionIds)[number]
export type SidebarSectionLimit = (typeof sidebarSectionLimits)[number]
export type SidebarSectionSort = (typeof sidebarSectionSorts)[number]

export type SidebarConfig = {
  hiddenItems: SidebarItemId[]
  libraryView: LibraryView
  sectionLimits: Record<SidebarSectionId, SidebarSectionLimit>
  sectionOrder: SidebarSectionId[]
  sectionSorts: Record<SidebarSectionId, SidebarSectionSort>
}

export const defaultSidebarConfig: SidebarConfig = {
  hiddenItems: [],
  libraryView: "recents",
  sectionLimits: {
    recents: 10,
    favorites: 10,
    private: 10,
    shared: 10,
  },
  sectionOrder: [...sidebarSectionIds],
  sectionSorts: {
    recents: "lastEdited",
    favorites: "lastEdited",
    private: "lastEdited",
    shared: "lastEdited",
  },
}

export function normalizeSidebarConfig(value: unknown): SidebarConfig {
  const config = isRecord(value) ? value : {}
  const sectionLimits = isRecord(config.sectionLimits)
    ? config.sectionLimits
    : {}
  const sectionSorts = isRecord(config.sectionSorts) ? config.sectionSorts : {}

  return {
    hiddenItems: uniqueValidValues(config.hiddenItems, sidebarItemIds),
    libraryView: isIncluded(config.libraryView, libraryViewIds)
      ? config.libraryView
      : defaultSidebarConfig.libraryView,
    sectionLimits: Object.fromEntries(
      sidebarSectionIds.map((sectionId) => [
        sectionId,
        isIncluded(sectionLimits[sectionId], sidebarSectionLimits)
          ? sectionLimits[sectionId]
          : defaultSidebarConfig.sectionLimits[sectionId],
      ]),
    ) as SidebarConfig["sectionLimits"],
    sectionOrder: completeSectionOrder(config.sectionOrder),
    sectionSorts: Object.fromEntries(
      sidebarSectionIds.map((sectionId) => [
        sectionId,
        isIncluded(sectionSorts[sectionId], sidebarSectionSorts)
          ? sectionSorts[sectionId]
          : defaultSidebarConfig.sectionSorts[sectionId],
      ]),
    ) as SidebarConfig["sectionSorts"],
  }
}

function completeSectionOrder(value: unknown): SidebarSectionId[] {
  const configured = uniqueValidValues(value, sidebarSectionIds)
  if (!configured.includes("recents")) {
    configured.unshift("recents")
  }
  return [
    ...configured,
    ...sidebarSectionIds.filter((sectionId) => !configured.includes(sectionId)),
  ]
}

function uniqueValidValues<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] {
  if (!Array.isArray(value)) return []

  return [...new Set(value.filter((item): item is T => isIncluded(item, allowed)))]
}

function isIncluded<T>(value: unknown, allowed: readonly T[]): value is T {
  return allowed.includes(value as T)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
