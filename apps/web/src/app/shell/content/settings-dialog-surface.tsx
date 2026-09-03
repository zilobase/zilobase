import { SettingsDialog } from "@/features/settings/components/settings-dialog"
import type { SettingsSection } from "@/features/settings/components/settings-sidebar"
import { SettingsSectionContent } from "./settings-section-content"

export function SettingsDialogSurface({
  activeSection,
  onOpenChange,
  onSectionChange,
}: {
  activeSection: SettingsSection
  onOpenChange: (open: boolean) => void
  onSectionChange: (section: SettingsSection) => void
}) {
  return (
    <SettingsDialog
      activeSection={activeSection}
      onOpenChange={onOpenChange}
      onSectionChange={onSectionChange}
      open
    >
      <SettingsSectionContent section={activeSection} />
    </SettingsDialog>
  )
}
