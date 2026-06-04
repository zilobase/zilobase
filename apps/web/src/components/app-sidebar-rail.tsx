"use client"

import { Link, useRouterState } from "@tanstack/react-router"
import {
  HomeIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useAppSearch } from "@/components/app-search"

const railItems = [
  {
    title: "Search",
    url: "#",
    icon: <SearchIcon />,
  },
  {
    title: "Ask AI",
    url: "/ai",
    icon: <SparklesIcon />,
  },
  {
    title: "Settings",
    url: "/settings/profile",
    icon: <Settings2Icon />,
  },
  {
    title: "Home",
    url: "/dashboard",
    icon: <HomeIcon />,
  },
]

export function AppSidebarRail() {
  const { openSearch } = useAppSearch()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <SidebarGroup className="p-2">
      <SidebarGroupContent>
        <SidebarMenu className="items-center gap-1">
          {railItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                className="size-8 justify-center p-0 [&>span]:sr-only"
                isActive={isRailItemActive(item.url, pathname)}
                tooltip={{
                  children: item.title,
                  hidden: false,
                }}
              >
                {item.title === "Search" ? (
                  <button onClick={openSearch} type="button">
                    {item.icon}
                    <span>{item.title}</span>
                  </button>
                ) : item.url.startsWith("/") ? (
                  <Link to={item.url as never}>
                    {item.icon}
                    <span>{item.title}</span>
                  </Link>
                ) : (
                  <a href={item.url}>
                    {item.icon}
                    <span>{item.title}</span>
                  </a>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function isRailItemActive(url: string, pathname: string) {
  return url !== "#" && (pathname === url || pathname.startsWith(`${url}/`))
}
