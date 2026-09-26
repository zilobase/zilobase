import { editionWebModule } from "@zilobase/edition-web";

import {
  ApiKeysSettingsPage,
  ConnectedAppsSettingsPage,
  OAuthAppsSettingsPage,
  PreferencesSettingsPage,
  ProfileSettingsPage,
  SecuritySettingsPage,
  settingsUi,
  type SettingsSection,
} from "@/features/settings";
import { TeamspacesSettingsPage } from "@/features/teamspaces";
import { TeamSettingsPage } from "@/features/workspaces";
import CalendarSettingsPage from "@/features/settings/screens/calendar";
import WorkspaceSettingsPage from "./workspace-settings";

export function SettingsSectionContent({ section }: { section: SettingsSection }) {
  const editionSection = editionWebModule.settingsSections.find(
    (candidate) => candidate.id === section,
  );
  if (editionSection) {
    const EditionSettings = editionSection.component;
    return <EditionSettings settingsUi={settingsUi} />;
  }

  switch (section) {
    case "preferences":
      return <PreferencesSettingsPage />;
    case "workspace":
      return <WorkspaceSettingsPage />;
    case "security":
      return <SecuritySettingsPage />;
    case "api-keys":
      return <ApiKeysSettingsPage />;
    case "connected-apps":
      return <ConnectedAppsSettingsPage />;
    case "oauth-apps":
      return <OAuthAppsSettingsPage />;
    case "team":
      return <TeamSettingsPage />;
    case "teamspaces":
      return <TeamspacesSettingsPage />;
    case "calendar":
      return <CalendarSettingsPage />;
    case "profile":
    default:
      return <ProfileSettingsPage />;
  }
}
