import { Link } from "@tanstack/react-router"
import { useRouterState } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  Building2Icon,
  PlugIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { ThemeDropdown } from "@/components/theme-dropdown"

const settingsItems = [
  {
    title: "Profile",
    href: "/settings/profile",
    icon: <UserIcon />,
  },
  {
    title: "Organization",
    href: "/settings/organization",
    icon: <Building2Icon />,
  },
  {
    title: "Integrations",
    href: "/settings/integrations",
    icon: <PlugIcon />,
  },
  {
    title: "Team",
    href: "/settings/team",
    icon: <UsersIcon />,
  },
]

export function SettingsSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs font-normal text-muted-foreground"
        >
          <Link to="/dashboard">
            <ArrowLeftIcon />
            <span>Back to dashboard</span>
          </Link>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link to={item.href}>
                      {item.icon}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <ThemeDropdown />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
