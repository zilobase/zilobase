import type { SidebarNavItem } from "./sidebar-nav-item"
import type { SidebarSectionId, SidebarSectionSort } from "@zilobase/features/user-settings"

export function getConfiguredSidebarItems<Icon>(
  items: SidebarNavItem<Icon>[],
  sectionId: SidebarSectionId,
  presentation: { limit: number; sort: SidebarSectionSort },
) {
  const sorted = [...items].sort((first, second) => {
    if (presentation.sort === "alphabetical") {
      return getDisplayName(first).localeCompare(getDisplayName(second), undefined, {
        sensitivity: "base",
      })
    }

    if (sectionId === "recents") {
      return getTime(second.lastVisitedAt) - getTime(first.lastVisitedAt)
    }

    return getTime(second.updatedAt) - getTime(first.updatedAt)
  })

  return sorted.slice(0, presentation.limit)
}

function getDisplayName(item: SidebarNavItem) {
  return item.name.trim() || "Untitled"
}

function getTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}
