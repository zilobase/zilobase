import {
  Building2Icon,
  KeyRoundIcon,
  PlugIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react"

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export type SettingsSection =
  | "profile"
  | "workspace"
  | "integrations"
  | "zilobase-ai"
  | "api-keys"
  | "team"

const settingsItems: Array<{
  title: string
  section: SettingsSection
  icon: typeof UserIcon
}> = [
  { title: "Profile", section: "profile", icon: UserIcon },
  { title: "Workspace", section: "workspace", icon: Building2Icon },
  { title: "Integrations", section: "integrations", icon: PlugIcon },
  { title: "Zilobase AI", section: "zilobase-ai", icon: SparklesIcon },
  { title: "API Keys", section: "api-keys", icon: KeyRoundIcon },
  { title: "Team", section: "team", icon: UsersIcon },
]

export function SettingsSidebar({
  activeSection,
  onSectionChange,
}: {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}) {
  return (
    <aside className="min-w-0 border-b border-sidebar-border bg-sidebar text-sidebar-foreground sm:h-full sm:w-64 sm:border-r sm:border-b-0">
      <SidebarContent className="overflow-visible sm:overflow-auto">
        <SidebarGroup className="p-2 sm:py-0">
          <SidebarGroupLabel className="hidden h-8 rounded-md px-2 text-xs text-sidebar-foreground/55 sm:flex">
            Settings
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Settings sections">
              <SidebarMenu className="flex-row gap-1 overflow-x-auto sm:flex-col sm:gap-0.5 sm:overflow-x-visible">
                {settingsItems.map((item) => {
                  const Icon = item.icon
                  const active = activeSection === item.section

                  return (
                    <SidebarMenuItem className="shrink-0" key={item.section}>
                      <SidebarMenuButton
                        aria-current={active ? "page" : undefined}
                        className="w-auto sm:w-full"
                        isActive={active}
                        onClick={() => onSectionChange(item.section)}
                        type="button"
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </aside>
  )
}

export function getSettingsSection(pathname: string): SettingsSection {
  const section = pathname.split("/")[2]

  return settingsItems.some((item) => item.section === section)
    ? (section as SettingsSection)
    : "profile"
}
