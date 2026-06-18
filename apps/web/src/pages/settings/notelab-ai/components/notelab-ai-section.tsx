import * as React from "react"
import { BookOpenIcon, WandSparklesIcon } from "lucide-react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type {
  NotelabAiMode,
  NotelabAiWorkspaceSummary,
} from "@notelab/features/workspaces"

import { NotelabAiCreateMenu } from "./notelab-ai-create-menu"
import { NotelabAiItem, NotelabAiItemGroup } from "./notelab-ai-item"

const sectionConfig: Record<
  NotelabAiMode,
  {
    description: string
    emptyDescription: string
    emptyTitle: string
    icon: React.ReactNode
    title: string
  }
> = {
  instruction: {
    title: "Instructions",
    description: "Pages the AI reads as persistent context.",
    emptyTitle: "No instructions",
    emptyDescription:
      "Create a new instruction or add an existing workspace page.",
    icon: <BookOpenIcon />,
  },
  skill: {
    title: "Skills",
    description: "Pages the AI can invoke as specialized capabilities.",
    emptyTitle: "No skills",
    emptyDescription:
      "Create a new skill or add an existing workspace page.",
    icon: <WandSparklesIcon />,
  },
}

export function NotelabAiSection({
  isLoading,
  items,
  mode,
  organizationId,
}: {
  isLoading: boolean
  items: NotelabAiWorkspaceSummary[]
  mode: NotelabAiMode
  organizationId: string | null
}) {
  const config = sectionConfig[mode]
  const existingWorkspaceIds = items.map((workspace) => workspace.id)
  const isEmpty = items.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
        {!isLoading && isEmpty ? (
          <CardAction>
            <NotelabAiCreateMenu
              existingWorkspaceIds={existingWorkspaceIds}
              mode={mode}
              organizationId={organizationId}
              trigger="header"
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <NotelabAiSectionSkeleton />
        ) : isEmpty ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">{config.icon}</EmptyMedia>
              <EmptyTitle>{config.emptyTitle}</EmptyTitle>
              <EmptyDescription>{config.emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <NotelabAiItemGroup>
            {items.map((workspace) => (
              <NotelabAiItem key={workspace.id} mode={mode} workspace={workspace} />
            ))}
            <NotelabAiCreateMenu
              existingWorkspaceIds={existingWorkspaceIds}
              mode={mode}
              organizationId={organizationId}
              trigger="list"
            />
          </NotelabAiItemGroup>
        )}
      </CardContent>
    </Card>
  )
}

function NotelabAiSectionSkeleton() {
  return (
    <div className="grid gap-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton className="h-16 rounded-lg" key={index} />
      ))}
    </div>
  )
}