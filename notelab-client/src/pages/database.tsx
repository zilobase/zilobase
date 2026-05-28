import { useCallback, useEffect, useState } from "react"
import { useParams } from "@tanstack/react-router"

import {
  getWorkspaceSidePaneWidthClass,
  useWorkspaceSidePane,
} from "@/components/app-layout"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { getDatabaseEmoji } from "@/features/databases/queries"
import {
  useUpdateWorkspace,
  useWorkspace,
  useWorkspaceAccessLevel,
} from "@/features/workspaces/hooks"
import {
  useDatabase,
  useUpdateDatabase,
} from "@/features/databases/hooks"
import { WorkspaceMetadata as WorkspaceMetadataView } from "@/packages/editor/components/editor/workspace-metadata"
import { DatabaseTableView } from "@/packages/editor/extensions/database"
import { WorkspaceEditorPane } from "@/pages/workspace"

export default function DatabasePage() {
  const { databaseId } = useParams({ from: "/app/database/$databaseId" })
  const { data: payload, isLoading } = useDatabase(databaseId)
  const { closeSidePane, openSidePane, sidePaneWorkspaceId } =
    useWorkspaceSidePane()
  const sidePaneWidthClass = getWorkspaceSidePaneWidthClass()
  const databasePageId = payload?.database.pageId ?? null

  const openPageInSidePane = useCallback((pageId: string) => {
    if (pageId === databasePageId || pageId === sidePaneWorkspaceId) {
      closeSidePane()
      return
    }

    openSidePane(pageId)
  }, [closeSidePane, databasePageId, openSidePane, sidePaneWorkspaceId])

  if (isLoading) {
    return (
      <main className="flex min-h-[calc(100svh-3rem)] items-center justify-center">
        <Spinner />
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="flex min-h-[calc(100svh-3rem)] items-center justify-center px-4 text-sm text-muted-foreground">
        Database not found.
      </main>
    )
  }

  return (
    <main className="relative flex h-full min-h-[calc(100svh-3rem)] flex-1 overflow-hidden">
      <DatabaseMainPane
        className="min-w-0 flex-1 overflow-y-auto"
        databaseId={databaseId}
        onOpenPage={openPageInSidePane}
      />
      {sidePaneWorkspaceId ? (
        <aside
          className={cn(
            "animate-in slide-in-from-right-8 absolute inset-0 z-10 flex flex-col bg-background duration-200 md:static md:z-auto md:border-l",
            sidePaneWidthClass,
          )}
          key={sidePaneWorkspaceId}
        >
          <WorkspaceEditorPane
            className="min-h-0 flex-1 overflow-y-auto"
            onOpenPage={openPageInSidePane}
            workspaceId={sidePaneWorkspaceId}
          />
        </aside>
      ) : null}
    </main>
  )
}

function DatabaseMainPane({
  className,
  databaseId,
  onOpenPage,
}: {
  className?: string
  databaseId: string
  onOpenPage: (pageId: string) => void
}) {
  const { data: payload } = useDatabase(databaseId)
  const databasePageId = payload?.database.pageId ?? null
  const { data: workspace } = useWorkspace(databasePageId)
  const { data: accessLevel } = useWorkspaceAccessLevel(databasePageId)
  const updateDatabase = useUpdateDatabase()
  const updateWorkspace = useUpdateWorkspace()
  const [title, setTitle] = useState("")
  const [emoji, setEmoji] = useState("")
  const editable = accessLevel === "edit" || accessLevel === "full"

  useEffect(() => {
    setTitle(payload?.database.name ?? "")
  }, [payload?.database.id, payload?.database.name])

  useEffect(() => {
    setEmoji(payload ? getDatabaseEmoji(payload.database) ?? "" : "")
  }, [payload])

  useEffect(() => {
    if (!payload || !editable || title.trim() === payload.database.name) {
      return
    }

    const timeout = window.setTimeout(() => {
      const nextTitle = title.trim()

      updateDatabase.mutate({
        databaseId: payload.database.id,
        name: nextTitle,
      })

      if (workspace && workspace.name !== nextTitle) {
        updateWorkspace.mutate({ id: workspace.id, name: nextTitle })
      }
    }, 600)

    return () => window.clearTimeout(timeout)
  }, [editable, payload, title, updateDatabase, updateWorkspace, workspace])

  const updateEmoji = (nextEmoji: string) => {
    setEmoji(nextEmoji)

    if (!payload || !editable) {
      return
    }

    updateDatabase.mutate({
      databaseId: payload.database.id,
      config: {
        ...((payload.database.config ?? {}) as Record<string, unknown>),
        emoji: nextEmoji,
      },
    })
  }

  return (
    <section className={className}>
      <WorkspaceMetadataView
        editable={editable}
        icon={emoji}
        onIconChange={updateEmoji}
        onTitleChange={setTitle}
        title={title}
        workspaceId={databasePageId}
      />
      <div className="tiptap-editor px-5 pb-10 sm:px-8 md:px-20 lg:px-24">
        <DatabaseTableView
          databaseId={databaseId}
          fullPage
          onOpenPage={onOpenPage}
          organizationId={payload?.database.organizationId}
          showTitle={false}
        />
      </div>
    </section>
  )
}
