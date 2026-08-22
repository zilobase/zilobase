import {
  Building2Icon,
  KeyRoundIcon,
  PlugIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
  Layers3Icon,
} from "lucide-react"
import type { ComponentType } from "react"
import { useSession } from "@zilobase/features/auth"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { getUserImageUrl } from "@/lib/image-upload"
import { editionWebModule } from "@zilobase/edition-web"

export type CoreSettingsSection =
  | "profile"
  | "preferences"
  | "workspace"
  | "integrations"
  | "zilobase-ai"
  | "api-keys"
  | "team"
  | "teamspaces"
export type SettingsSection = CoreSettingsSection | string

const settingsItems: Array<{
  title: string
  section: SettingsSection
  icon: ComponentType<{ className?: string }>
}> = [
  { title: "Profile", section: "profile", icon: UserIcon },
  {
    title: "Preferences",
    section: "preferences",
    icon: SlidersHorizontalIcon,
  },
  { title: "Workspace", section: "workspace", icon: Building2Icon },
  { title: "Integrations", section: "integrations", icon: PlugIcon },
  { title: "Zilobase AI", section: "zilobase-ai", icon: SparklesIcon },
  { title: "API Keys", section: "api-keys", icon: KeyRoundIcon },
  { title: "Team", section: "team", icon: UsersIcon },
  { title: "Teamspaces", section: "teamspaces", icon: Layers3Icon },
  ...editionWebModule.settingsSections.map((section) => ({
    title: section.title,
    section: section.id,
    icon: section.icon ?? SlidersHorizontalIcon,
  })),
]

export function SettingsSidebar({
  activeSection,
  onSectionChange,
}: {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}) {
  const { data: sessionData } = useSession()
  const profileTitle = sessionData?.user?.name.trim() || "Profile"
  const profileImage = sessionData?.user?.image

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
                        {item.section === "profile" && profileImage ? (
                          <Avatar className="size-4">
                            <AvatarImage
                              alt=""
                              src={getUserImageUrl(profileImage)}
                            />
                            <AvatarFallback>
                              <UserIcon />
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <Icon />
                        )}
                        <span className="min-w-0 truncate">
                          {item.section === "profile" ? profileTitle : item.title}
                        </span>
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
    : "preferences"
}
