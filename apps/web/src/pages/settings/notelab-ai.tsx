import * as React from "react"

import { SettingsHeader } from "@/components/settings-header"
import { useActiveWorkspaceId } from "@notelab/features/integrations"
import {
  useNotelabAiPages,
  usePages,
} from "@notelab/features/pages"

import { NotelabAiSection } from "./notelab-ai/components/notelab-ai-section"

export default function NotelabAiSettingsPage() {
  const workspaceId = useActiveWorkspaceId()
  const { data: aiPages = [], isLoading } =
    useNotelabAiPages(workspaceId)
  const { data: pages = [] } = usePages(workspaceId)
  const pagesById = React.useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  )

  const instructions = React.useMemo(
    () =>
      aiPages.filter(
        (page) => page.metadata.notelabai === "instruction",
      ),
    [aiPages],
  )

  const skills = React.useMemo(
    () =>
      aiPages.filter(
        (page) => page.metadata.notelabai === "skill",
      ),
    [aiPages],
  )

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Notelab AI"
        description="Manage pages used as AI instructions and skills."
      />

      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <NotelabAiSection
          isLoading={isLoading}
          items={instructions}
          mode="instruction"
          workspaceId={workspaceId ?? null}
          pagesById={pagesById}
        />
        <NotelabAiSection
          isLoading={isLoading}
          items={skills}
          mode="skill"
          workspaceId={workspaceId ?? null}
          pagesById={pagesById}
        />
      </div>
    </main>
  )
}