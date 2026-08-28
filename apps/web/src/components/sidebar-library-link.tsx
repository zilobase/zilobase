import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon } from "@/components/icons"

import { SidebarGroupAction } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type {
  LibraryView,
  LegacySidebarConfig,
  SidebarSectionId,
} from "@zilobase/features/user-settings"

export function SidebarLibraryLink({
  className,
  label,
  onSidebarConfigChange,
  sectionId,
  sidebarConfig,
  view: viewOverride,
}: {
  className?: string
  label: string
  onSidebarConfigChange?: (config: LegacySidebarConfig) => void
  sectionId: SidebarSectionId
  sidebarConfig?: LegacySidebarConfig
  view?: LibraryView
}) {
  const view = viewOverride ?? getLibraryViewForSection(sectionId)

  return (
    <SidebarGroupAction
      asChild
      className={cn(
        "transition-opacity md:opacity-0 md:group-hover/section-header:opacity-100 md:focus-visible:opacity-100",
        className,
      )}
    >
      <Link
        aria-label={`Open ${label} in Library`}
        onClick={() => {
          if (
            sidebarConfig &&
            onSidebarConfigChange &&
            sidebarConfig.libraryView !== view
          ) {
            onSidebarConfigChange({ ...sidebarConfig, libraryView: view })
          }
        }}
        search={{ view }}
        title={`Open ${label} in Library`}
        to="/recents"
      >
        <ArrowUpRightIcon />
      </Link>
    </SidebarGroupAction>
  )
}

export function getLibraryViewForSection(
  sectionId: SidebarSectionId,
): LibraryView {
  return sectionId === "favorites" ? "favourites" : sectionId
}
