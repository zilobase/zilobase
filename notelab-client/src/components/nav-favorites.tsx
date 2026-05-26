"use client"

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
import { MoreHorizontalIcon, StarOffIcon, LinkIcon, ArrowUpRightIcon, Trash2Icon } from "lucide-react"

export function NavFavorites({
  favorites,
}: {
  favorites: {
    name: string
    url: string
    emoji: string
  }[]
}) {
  const { isMobile } = useSidebar()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Favorites</SidebarGroupLabel>
      <SidebarMenu>
        {favorites.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild>
              <a href={item.url} title={item.name}>
                <span>{item.emoji}</span>
                <span>{item.name}</span>
              </a>
            </SidebarMenuButton>
            <DropDrawer>
              <DropDrawerTrigger asChild>
                <SidebarMenuAction
                  showOnHover
                  className="aria-expanded:bg-muted"
                >
                  <MoreHorizontalIcon
                  />
                  <span className="sr-only">More</span>
                </SidebarMenuAction>
              </DropDrawerTrigger>
              <DropDrawerContent
                className="w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropDrawerItem>
                  <StarOffIcon className="text-muted-foreground" />
                  <span>Remove from Favorites</span>
                </DropDrawerItem>
                <DropDrawerSeparator />
                <DropDrawerItem>
                  <LinkIcon className="text-muted-foreground" />
                  <span>Copy Link</span>
                </DropDrawerItem>
                <DropDrawerItem>
                  <ArrowUpRightIcon className="text-muted-foreground" />
                  <span>Open in New Tab</span>
                </DropDrawerItem>
                <DropDrawerSeparator />
                <DropDrawerItem>
                  <Trash2Icon className="text-muted-foreground" />
                  <span>Delete</span>
                </DropDrawerItem>
              </DropDrawerContent>
            </DropDrawer>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton className="text-sidebar-foreground/70">
            <MoreHorizontalIcon
            />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
