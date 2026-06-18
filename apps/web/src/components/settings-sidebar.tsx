import { Link } from "@tanstack/react-router"
import { useRouterState } from "@tanstack/react-router"
import {
  Building2Icon,
  KeyRoundIcon,
  PlugIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react"

import { AppSidebarShell } from "@/components/app-sidebar-shell"
import { ThemeDropdown } from "@/components/theme-dropdown"
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
  SidebarTrigger,
} from "@/components/ui/sidebar"

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
    title: "Notelab AI",
    href: "/settings/notelab-ai",
    icon: <SparklesIcon />,
  },
  {
    title: "API Keys",
    href: "/settings/api-keys",
    icon: <KeyRoundIcon />,
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
    <AppSidebarShell {...props}>
      <SidebarHeader>
        <div className="flex justify-end">
          <SidebarTrigger className="shrink-0 group-data-[collapsible=icon]:hidden" />
        </div>
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
    </AppSidebarShell>
  )
}
