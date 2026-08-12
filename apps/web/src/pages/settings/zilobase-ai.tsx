import * as React from "react"

import { SettingsHeader } from "@/components/settings-header"
import { Separator } from "@/components/ui/separator"
import { useActiveWorkspaceId } from "@zilobase/features/integrations"
import {
  useZilobaseAiPages,
  usePages,
} from "@zilobase/features/pages"

import { ZilobaseAiSection } from "./zilobase-ai/components/zilobase-ai-section"

export default function ZilobaseAiSettingsPage() {
  const workspaceId = useActiveWorkspaceId()
  const { data: aiPages = [], isLoading } =
    useZilobaseAiPages(workspaceId)
  const { data: pages = [] } = usePages(workspaceId)
  const pagesById = React.useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  )

  const instructions = React.useMemo(
    () =>
      aiPages.filter(
        (page) => page.metadata.zilobaseai === "instruction",
      ),
    [aiPages],
  )

  const skills = React.useMemo(
    () =>
      aiPages.filter(
        (page) => page.metadata.zilobaseai === "skill",
      ),
    [aiPages],
  )

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Zilobase AI"
        description="Manage pages used as AI instructions and skills."
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <ZilobaseAiSection
          isLoading={isLoading}
          items={instructions}
          mode="instruction"
          workspaceId={workspaceId ?? null}
          pagesById={pagesById}
        />
        <Separator />
        <ZilobaseAiSection
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
