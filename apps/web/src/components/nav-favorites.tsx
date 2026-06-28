"use client"

import { useState } from "react"
import { useLocation } from "@tanstack/react-router"
import {
  ArrowUpRightIcon,
  LinkIcon,
  MoreHorizontalIcon,
  StarOffIcon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  getActiveDatabaseId,
  getActiveDatabaseViewId,
  getActivePageId,
  NavTree,
  type PageNavItem,
} from "@/components/nav-tree"

export function NavFavorites({
  favorites,
  onRemoveDatabaseFavorite,
  onRemoveFavorite,
}: {
  favorites: PageNavItem[]
  onRemoveDatabaseFavorite: (databaseId: string) => void
  onRemoveFavorite: (pageId: string) => void
}) {
  const location = useLocation()
  const activePageId = getActivePageId(location.pathname)
  const activeDatabaseId = getActiveDatabaseId(location.pathname)
  const activeDatabaseViewId = getActiveDatabaseViewId(location.search)

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Favorites</SidebarGroupLabel>
      <SidebarMenu>
        <NavTree
          activeDatabaseId={activeDatabaseId}
          activeDatabaseViewId={activeDatabaseViewId}
          activePageId={activePageId}
          items={favorites}
          renderItemMenu={({ item, nested }) => (
            <FavoriteItemMenu
              item={item}
              onRemoveDatabaseFavorite={onRemoveDatabaseFavorite}
              onRemoveFavorite={onRemoveFavorite}
              requireRemoveConfirmation={nested}
            />
          )}
        />
        {favorites.length === 0 ? (
          <SidebarMenuItem>
            <SidebarMenuButton className="text-sidebar-foreground/50">
              <span>No favorites</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function FavoriteItemMenu({
  item,
  onRemoveDatabaseFavorite,
  onRemoveFavorite,
  requireRemoveConfirmation,
}: {
  item: PageNavItem
  onRemoveDatabaseFavorite: (databaseId: string) => void
  onRemoveFavorite: (pageId: string) => void
  requireRemoveConfirmation: boolean
}) {
  const { isMobile } = useSidebar()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const linkPath =
    item.isDatabase && item.databaseId
      ? `/database/${item.databaseId}`
      : `/page/${item.pageId}`
  const displayName = item.name.trim() || "Untitled"
  const removeFavorite = () => {
    if (item.isDatabase && item.databaseId) {
      onRemoveDatabaseFavorite(item.databaseId)
      return
    }

    onRemoveFavorite(item.pageId)
  }

  return (
    <>
      <DropDrawer>
        <DropDrawerTrigger asChild>
          <SidebarMenuAction
            className="opacity-0 group-hover/nav-row:opacity-100 focus-visible:opacity-100 aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
            data-nav-menu-action="more"
          >
            <MoreHorizontalIcon />
            <span className="sr-only">More</span>
          </SidebarMenuAction>
        </DropDrawerTrigger>
        <DropDrawerContent
          align={isMobile ? "end" : "start"}
          className="w-56 rounded-lg"
          side={isMobile ? "bottom" : "right"}
        >
          <DropDrawerItem
            onSelect={() => {
              if (requireRemoveConfirmation) {
                setConfirmOpen(true)
                return
              }

              removeFavorite()
            }}
          >
            <StarOffIcon className="text-muted-foreground" />
            <span>Remove from Favorites</span>
          </DropDrawerItem>
          <DropDrawerSeparator />
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
              window.open(linkPath, "_blank", "noopener")
            }}
          >
            <ArrowUpRightIcon className="text-muted-foreground" />
            <span>Open in New Tab</span>
          </DropDrawerItem>
        </DropDrawerContent>
      </DropDrawer>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Parent is favorited</AlertDialogTitle>
            <AlertDialogDescription>
              {displayName} is inside a favorited parent. Unfavorite it anyway?
              This will also remove its nested items from Favorites.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeFavorite}>
              Unfavorite anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
