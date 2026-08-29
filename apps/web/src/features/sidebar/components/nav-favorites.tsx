"use client"

import { useLocation } from "@tanstack/react-router"
import {
  ArrowUpRightIcon,
  ChevronRightIcon,
  LinkIcon,
  MoreHorizontalIcon,
  StarOffIcon,
} from "@/shared/components/icons"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/shared/ui/sidebar"
import {
  getActiveDatabaseId,
  getActiveDatabaseViewId,
  getActiveMeetingId,
  getActivePageId,
  SidebarNavList,
  type SidebarNavItem,
} from "./sidebar-nav-list"
import { SidebarNavItemAction } from "@/shared/ui/sidebar-nav-item-action"
import { useOpenInNewTab } from "@/components/desktop-tabs"
import { getSidebarExpansionStorageKey } from "../model/sidebar-expansion-state"
import { SidebarSectionMenu } from "./sidebar-section-menu"
import { getConfiguredSidebarItems } from "../model/sidebar-section-items"
import { SidebarLibraryLink } from "./sidebar-library-link"
import { useSidebarSectionOpen } from "../model/sidebar-section-open-state"
import type { LegacySidebarConfig } from "@zilobase/features/user-settings"

export function NavFavorites({
  favorites,
  onRemoveDatabaseFavorite,
  onRemoveFavorite,
  onCustomizeSidebar,
  onSidebarConfigChange,
  sidebarConfig,
  sectionStorageKey,
  workspaceId,
}: {
  favorites: SidebarNavItem[]
  onRemoveDatabaseFavorite: (databaseId: string) => void
  onRemoveFavorite: (pageId: string) => void
  onCustomizeSidebar?: () => void
  onSidebarConfigChange?: (config: LegacySidebarConfig) => void
  sidebarConfig?: LegacySidebarConfig
  sectionStorageKey?: string
  workspaceId: string | null
}) {
  const [open, setOpen] = useSidebarSectionOpen(sectionStorageKey ?? `zilobase:sidebar-section:favorites:${workspaceId ?? "default"}`)
  const location = useLocation()
  const activePageId = getActivePageId(location.pathname)
  const activeDatabaseId = getActiveDatabaseId(location.pathname)
  const activeDatabaseViewId = getActiveDatabaseViewId(location.search)
  const activeMeetingId = getActiveMeetingId(
    location.pathname,
    location.search,
  )
  const displayedFavorites = sidebarConfig
    ? getConfiguredSidebarItems(favorites, "favorites", sidebarConfig)
    : favorites

  return (
    <Collapsible asChild onOpenChange={setOpen} open={open}>
      <SidebarGroup className="group/collapsible">
        <div className="group/section-header relative">
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel
              asChild
              className="pr-16 group-hover/section-header:bg-accent group-hover/section-header:text-accent-foreground group-has-[>[data-sidebar=group-action][aria-expanded=true]]/section-header:bg-accent group-has-[>[data-sidebar=group-action][aria-expanded=true]]/section-header:text-accent-foreground"
            >
              <button
                className="group/section-label w-full cursor-pointer"
                type="button"
              >
                <span>Favorites</span>
                <ChevronRightIcon className="ml-1 size-3 transition-transform group-data-[state=open]/section-label:rotate-90" />
              </button>
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          {sidebarConfig && onSidebarConfigChange && onCustomizeSidebar ? (
            <SidebarSectionMenu
              className="right-2"
              config={sidebarConfig}
              onChange={onSidebarConfigChange}
              onCustomize={onCustomizeSidebar}
              sectionId="favorites"
            />
          ) : null}
          <SidebarLibraryLink
            className={
              sidebarConfig && onSidebarConfigChange && onCustomizeSidebar
                ? "right-9"
                : "right-2"
            }
            label="Favorites"
            onSidebarConfigChange={onSidebarConfigChange}
            sectionId="favorites"
            sidebarConfig={sidebarConfig}
          />
        </div>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarMenu aria-label="Favorite pages">
            <SidebarNavList
              activeDatabaseId={activeDatabaseId}
              activeDatabaseViewId={activeDatabaseViewId}
              activePageId={activePageId}
              activeMeetingId={activeMeetingId}
              items={displayedFavorites}
              renderItemMenu={({ item }) =>
                item.isMeeting ? null : (
                  <FavoriteItemMenu
                    item={item}
                    onRemoveDatabaseFavorite={onRemoveDatabaseFavorite}
                    onRemoveFavorite={onRemoveFavorite}
                  />
                )
              }
              storageKey={getSidebarExpansionStorageKey(
                workspaceId,
                "favorites",
              )}
            />
            {displayedFavorites.length === 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <span>No favorites</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}

function FavoriteItemMenu({
  item,
  onRemoveDatabaseFavorite,
  onRemoveFavorite,
}: {
  item: SidebarNavItem
  onRemoveDatabaseFavorite: (databaseId: string) => void
  onRemoveFavorite: (pageId: string) => void
}) {
  const { isMobile } = useSidebar()
  const openInNewTab = useOpenInNewTab()
  const linkPath =
    item.isDatabase && item.databaseId
      ? `/d/${item.databaseId}`
      : `/p/${item.pageId}`
  const removeFavorite = () => {
    if (item.isDatabase && item.databaseId) {
      onRemoveDatabaseFavorite(item.databaseId)
      return
    }

    if (item.pageId) {
      onRemoveFavorite(item.pageId)
    }
  }

  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <SidebarNavItemAction variant="menu">
          <MoreHorizontalIcon />
          <span className="sr-only">More</span>
        </SidebarNavItemAction>
      </DropDrawerTrigger>
      <DropDrawerContent
        align={isMobile ? "end" : "start"}
        className="w-56 rounded-lg"
        side={isMobile ? "bottom" : "right"}
      >
        {item.isFavorite ? (
          <>
            <DropDrawerItem onSelect={removeFavorite}>
              <StarOffIcon className="text-muted-foreground" />
              <span>Remove from Favorites</span>
            </DropDrawerItem>
            <DropDrawerSeparator />
          </>
        ) : null}
        <DropDrawerItem
          onSelect={() => {
            void navigator.clipboard?.writeText(
              `${window.location.origin}${linkPath}`,
            )
          }}
        >
          <LinkIcon className="text-muted-foreground" />
          <span>Copy Link</span>
        </DropDrawerItem>
        <DropDrawerItem
          onSelect={() => {
            openInNewTab({
              href: linkPath,
              title: item.name.trim() || "Untitled",
            })
          }}
        >
          <ArrowUpRightIcon className="text-muted-foreground" />
          <span>Open in New Tab</span>
        </DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  )
}
