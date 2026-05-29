import { Link, useLocation } from "@tanstack/react-router"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon: React.ReactNode
    isActive?: boolean
  }[]
}) {
  const location = useLocation()

  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            asChild
            isActive={isNavigationItemActive(item.url, location.pathname)}
          >
            {item.url.startsWith("/") ? (
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
  )
}

function isNavigationItemActive(url: string, pathname: string) {
  return url !== "#" && pathname === url
}
