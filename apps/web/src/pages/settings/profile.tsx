import { SettingsHeader } from "@/components/settings-header"

export default function ProfileSettingsPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Profile"
        description="Update your personal details and account preferences."
      />
    </main>
  )
}
