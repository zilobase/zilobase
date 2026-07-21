import { Link } from "@tanstack/react-router"
import { useRouterState } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  Building2Icon,
  CreditCardIcon,
  KeyRoundIcon,
  PlugIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react"

import {
  AppSidebarHeader,
  AppSidebarShell,
} from "@/components/app-sidebar-shell"
import { ThemeDropdown } from "@/components/theme-dropdown"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const settingsItems = [
  {
    title: "Profile",
    href: "/settings/profile",
    icon: <UserIcon />,
  },
  {
    title: "Workspace",
    href: "/settings/workspace",
    icon: <Building2Icon />,
  },
  {
    title: "Integrations",
    href: "/settings/integrations",
    icon: <PlugIcon />,
  },
  {
    title: "Zilobase AI",
    href: "/settings/zilobase-ai",
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
  {
    title: "Plan & License",
    href: "/settings/plan",
    icon: <CreditCardIcon />,
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
      <AppSidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Home">
              <Link to="/dashboard">
                <ArrowLeftIcon />
                <span>Home</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </AppSidebarHeader>
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
