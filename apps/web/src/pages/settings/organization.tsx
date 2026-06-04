import { SettingsHeader } from "@/components/settings-header"

export default function OrganizationSettingsPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Organization"
        description="Manage workspace details, billing identity, and defaults."
      />
    </main>
  )
}
