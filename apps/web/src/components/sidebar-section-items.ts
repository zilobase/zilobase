import type { SidebarNavItem } from "@/components/sidebar-nav-list"
import type {
  SidebarConfig,
  SidebarSectionId,
} from "@zilobase/features/user-settings"

export function getConfiguredSidebarItems(
  items: SidebarNavItem[],
  sectionId: SidebarSectionId,
  config: SidebarConfig,
) {
  const sorted = [...items].sort((first, second) => {
    if (config.sectionSorts[sectionId] === "alphabetical") {
      return getDisplayName(first).localeCompare(getDisplayName(second), undefined, {
        sensitivity: "base",
      })
    }

    return getUpdatedTime(second) - getUpdatedTime(first)
  })

  return sorted.slice(0, config.sectionLimits[sectionId])
}

function getDisplayName(item: SidebarNavItem) {
  return item.name.trim() || "Untitled"
}

function getUpdatedTime(item: SidebarNavItem) {
  const time = item.updatedAt ? new Date(item.updatedAt).getTime() : 0
  return Number.isFinite(time) ? time : 0
}
