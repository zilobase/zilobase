import { editionWebModule } from "@zilobase/edition-web"

import {
  ApiKeysSettingsPage,
  PreferencesSettingsPage,
  ProfileSettingsPage,
  SecuritySettingsPage,
  type SettingsSection,
  ZilobaseAiSettingsPage,
} from "@/features/settings"
import { TeamSettingsPage, TeamspacesSettingsPage } from "@/features/teamspaces"
import { WorkspaceSettingsPage } from "@/features/workspaces"

export function SettingsSectionContent({ section }: { section: SettingsSection }) {
  const editionSection = editionWebModule.settingsSections.find((candidate) => candidate.id === section)
  if (editionSection) {
    const EditionSettings = editionSection.component
    return <EditionSettings />
  }

  switch (section) {
    case "preferences": return <PreferencesSettingsPage />
    case "workspace": return <WorkspaceSettingsPage />
    case "security": return <SecuritySettingsPage />
    case "zilobase-ai": return <ZilobaseAiSettingsPage />
    case "api-keys": return <ApiKeysSettingsPage />
    case "team": return <TeamSettingsPage />
    case "teamspaces": return <TeamspacesSettingsPage />
    case "profile":
    default: return <ProfileSettingsPage />
  }
}
