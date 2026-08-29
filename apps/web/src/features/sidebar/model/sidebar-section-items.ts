import type { SidebarNavItem } from "../components/sidebar-nav-list"
import type {
  LegacySidebarConfig,
  SidebarSectionId,
} from "@zilobase/features/user-settings"

export function getConfiguredSidebarItems(
  items: SidebarNavItem[],
  sectionId: SidebarSectionId,
  config: LegacySidebarConfig,
) {
  const sorted = [...items].sort((first, second) => {
    if (config.sectionSorts[sectionId] === "alphabetical") {
      return getDisplayName(first).localeCompare(getDisplayName(second), undefined, {
        sensitivity: "base",
      })
    }

    if (sectionId === "recents") {
      return getTime(second.lastVisitedAt) - getTime(first.lastVisitedAt)
    }

    return getTime(second.updatedAt) - getTime(first.updatedAt)
  })

  return sorted.slice(0, config.sectionLimits[sectionId])
}

function getDisplayName(item: SidebarNavItem) {
  return item.name.trim() || "Untitled"
}

function getTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}
