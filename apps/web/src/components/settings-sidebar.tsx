import {
  Building2Icon,
  KeyRoundIcon,
  PlugIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

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
    <aside className="min-w-0 border-b bg-muted/35 p-2 sm:h-full sm:w-60 sm:border-r sm:border-b-0 sm:p-3">
      <div className="mb-2 hidden px-2 pt-1 text-xs font-medium text-muted-foreground sm:block">
        Settings
      </div>
      <nav
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-x-visible"
      >
        {settingsItems.map((item) => {
          const Icon = item.icon
          const active = activeSection === item.section

          return (
            <button
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
              key={item.section}
              onClick={() => onSectionChange(item.section)}
              type="button"
            >
              <Icon className="size-4" />
              <span>{item.title}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

export function getSettingsSection(pathname: string): SettingsSection {
  const section = pathname.split("/")[2]

  return settingsItems.some((item) => item.section === section)
    ? (section as SettingsSection)
    : "profile"
}
