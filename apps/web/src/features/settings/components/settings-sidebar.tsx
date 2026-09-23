import {
  Building2Icon,
  CalendarIcon,
  Code as CodeIcon,
  MailIcon,
  KeyRoundIcon,
  Link2,
  SlidersHorizontalIcon,
  UserIcon,
  UsersIcon,
  Layers3Icon,
  LockIcon,
} from "@/shared/components/icons"
import { useEffect, type ComponentType } from "react"
import { useSession } from "@zilobase/features/auth/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react"
import { useIntegrationAvailability } from "@/features/sidebar/model/use-integration-availability"
import { isSettingsSectionAvailable } from "../model/settings-section-availability"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/shared/ui/avatar"
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar"
import { getUserImageUrl } from "@/platform/network/image-upload"
import { editionWebModule } from "@zilobase/edition-web"

export type CoreSettingsSection =
  | "profile"
  | "preferences"
  | "security"
  | "workspace"
  | "api-keys"
  | "connected-apps"
  | "oauth-apps"
  | "team"
  | "teamspaces"
  | "mail"
  | "calendar"
export type SettingsSection = CoreSettingsSection | string

const settingsItems: Array<{
  title: string
  section: SettingsSection
  icon: ComponentType<{ className?: string }>
}> = [
  { title: "Profile", section: "profile", icon: UserIcon },
  { title: "Security", section: "security", icon: LockIcon },
  {
    title: "Preferences",
    section: "preferences",
    icon: SlidersHorizontalIcon,
  },
  { title: "Workspace", section: "workspace", icon: Building2Icon },
  { title: "API Keys", section: "api-keys", icon: KeyRoundIcon },
  { title: "Connected apps", section: "connected-apps", icon: Link2 },
  { title: "OAuth apps", section: "oauth-apps", icon: CodeIcon },
  { title: "Team", section: "team", icon: UsersIcon },
  { title: "Teamspaces", section: "teamspaces", icon: Layers3Icon },
  { title: "Mail", section: "mail", icon: MailIcon },
  { title: "Calendar", section: "calendar", icon: CalendarIcon },
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
  const workspaceId = useActiveWorkspaceId()
  const integrations = useIntegrationAvailability(workspaceId)
  const profileTitle = sessionData?.user?.name.trim() || "Profile"
  const profileImage = sessionData?.user?.image
  const visibleItems = settingsItems.filter((item) =>
    isSettingsSectionAvailable(item.section, integrations),
  )

  useEffect(() => {
    if (!integrations.settled) return
    if (!isSettingsSectionAvailable(activeSection, integrations)) {
      onSectionChange("preferences")
    }
  }, [activeSection, integrations, onSectionChange])

  return (
    <aside className="min-w-0 border-b border-stroke-default bg-surface-navigation text-content-primary sm:h-full sm:w-64 sm:border-r sm:border-b-0">
      <SidebarContent className="gap-0 overflow-visible pt-0 pb-0 sm:overflow-auto">
        <SidebarGroup className="p-2 sm:py-0">
          <SidebarGroupLabel className="hidden h-8 rounded-md px-2 text-xs text-content-secondary sm:flex">
            Settings
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Settings sections">
              <SidebarMenu className="flex-row gap-1 overflow-x-auto sm:flex-col sm:gap-0.5 sm:overflow-x-visible">
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const active = activeSection === item.section

                  return (
                    <SidebarMenuItem className="shrink-0" key={item.section}>
                      <SidebarMenuButton
                        aria-current={active ? "page" : undefined}
                        className="h-7 w-auto p-1.5 sm:w-full"
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
