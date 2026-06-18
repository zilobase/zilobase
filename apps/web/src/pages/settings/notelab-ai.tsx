import * as React from "react"

import { SettingsHeader } from "@/components/settings-header"
import { useActiveOrganizationId } from "@notelab/features/integrations"
import { useNotelabAiWorkspaces } from "@notelab/features/workspaces"

import { NotelabAiSection } from "./notelab-ai/components/notelab-ai-section"

export default function NotelabAiSettingsPage() {
  const organizationId = useActiveOrganizationId()
  const { data: aiWorkspaces = [], isLoading } =
    useNotelabAiWorkspaces(organizationId)

  const instructions = React.useMemo(
    () =>
      aiWorkspaces.filter(
        (workspace) => workspace.metadata.notelabai === "instruction",
      ),
    [aiWorkspaces],
  )

  const skills = React.useMemo(
    () =>
      aiWorkspaces.filter(
        (workspace) => workspace.metadata.notelabai === "skill",
      ),
    [aiWorkspaces],
  )

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Notelab AI"
        description="Manage workspace pages used as AI instructions and skills."
      />

      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <NotelabAiSection
          isLoading={isLoading}
          items={instructions}
          mode="instruction"
          organizationId={organizationId ?? null}
        />
        <NotelabAiSection
          isLoading={isLoading}
          items={skills}
          mode="skill"
          organizationId={organizationId ?? null}
        />
      </div>
    </main>
  )
}