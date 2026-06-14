import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { ArrowRight, Maximize2 } from "lucide-react"

import {
  AppLayout,
  getWorkspaceSidePaneWidthClass,
  WorkspaceSidePaneProvider,
  useWorkspaceSidePane,
} from "@/components/app-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getDatabaseEmoji } from "@notelab/features/databases"
import {
  useUpdateWorkspace,
  useWorkspace,
  useWorkspaceAccessLevel,
} from "@notelab/features/workspaces"
import {
  useDatabase,
  useUpdateDatabase,
} from "@notelab/features/databases"
import { useSession } from "@notelab/features/auth"
import { WorkspaceMetadata as WorkspaceMetadataView } from "@/packages/editor/components/editor/workspace-metadata"
import { DatabaseView } from "@/packages/editor/extensions/database"
import {
  PublicPaneTopbar,
  PublicWorkspaceBreadcrumb,
  WorkspaceEditorPane,
} from "@/pages/workspace"

export default function DatabasePage() {
  const { data: session } = useSession()

  if (!session?.user) {
    return <PublicDatabasePage />
  }

  return (
    <AppLayout>
      <AuthenticatedDatabasePage />
    </AppLayout>
  )
}

function AuthenticatedDatabasePage() {
  const { databaseId } = useParams({ from: "/database/$databaseId" })
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
      <main className="min-h-[calc(100svh-3rem)] animate-in fade-in duration-200">
        <DatabasePageSkeleton />
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
    <main className="relative flex h-full min-h-[calc(100svh-3rem)] flex-1 overflow-hidden animate-in fade-in-0 duration-300">
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

function PublicDatabasePage() {
  const { databaseId } = useParams({ from: "/database/$databaseId" })

  return (
    <WorkspaceSidePaneProvider resetKey={databaseId}>
      <PublicDatabaseContent databaseId={databaseId} />
    </WorkspaceSidePaneProvider>
  )
}

function PublicDatabaseContent({ databaseId }: { databaseId: string }) {
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
      <main className="min-h-svh animate-in fade-in duration-200 bg-background">
        <DatabasePageSkeleton />
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Database not found.
      </main>
    )
  }

  return (
    <main className="relative flex min-h-svh flex-1 overflow-hidden bg-background animate-in fade-in-0 duration-300">
      <div className="flex min-w-0 flex-1 flex-col">
        <PublicPaneTopbar workspaceId={databasePageId} />
        <DatabaseMainPane
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
          databaseId={databaseId}
          onOpenPage={openPageInSidePane}
          readOnly
        />
      </div>
      {sidePaneWorkspaceId ? (
        <aside
          className={cn(
            "animate-in slide-in-from-right-8 absolute inset-0 z-10 flex flex-col bg-background duration-200 md:static md:z-auto md:border-l",
            sidePaneWidthClass,
          )}
          key={sidePaneWorkspaceId}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <div className="flex shrink-0 items-center gap-1">
              <Button
                aria-label="Close side pane"
                onClick={closeSidePane}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ArrowRight />
              </Button>
              <Button
                aria-label="Open as main page"
                asChild
                size="icon-sm"
                variant="ghost"
              >
                <Link
                  params={{ workspaceId: sidePaneWorkspaceId }}
                  to="/workspace/$workspaceId"
                >
                  <Maximize2 />
                </Link>
              </Button>
            </div>
            <PublicWorkspaceBreadcrumb workspaceId={sidePaneWorkspaceId} />
          </div>
          <WorkspaceEditorPane
            className="min-h-0 flex-1 overflow-y-auto"
            onOpenPage={openPageInSidePane}
            readOnly
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
  readOnly = false,
}: {
  className?: string
  databaseId: string
  onOpenPage: (pageId: string) => void
  readOnly?: boolean
}) {
  const { data: payload } = useDatabase(databaseId)
  const databasePageId = payload?.database.pageId ?? null
  const { data: workspace } = useWorkspace(databasePageId)
  const { data: accessLevel } = useWorkspaceAccessLevel(databasePageId)
  const updateDatabase = useUpdateDatabase()
  const updateWorkspace = useUpdateWorkspace()
  const [title, setTitle] = useState("")
  const [emoji, setEmoji] = useState("")
  const editable = !readOnly && (accessLevel === "edit" || accessLevel === "full")

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
    <section className={cn(className, "animate-in fade-in-0 duration-300")}>
      <WorkspaceMetadataView
        editable={editable}
        enableComments={false}
        icon={emoji}
        onIconChange={updateEmoji}
        onTitleChange={setTitle}
        title={title}
        workspaceId={databasePageId}
      />
      <div className="tiptap-editor px-5 pb-10 sm:px-8 md:px-20 lg:px-24">
        <DatabaseView
          databaseId={databaseId}
          editable={!readOnly}
          fullPage
          onOpenPage={onOpenPage}
          organizationId={payload?.database.organizationId}
          showTitle={false}
        />
      </div>
    </section>
  )
}

export function DatabasePagePreview({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <div
        className={cn(
          "w-full space-y-6",
          compact
            ? "px-4 pb-4 pt-4"
            : "px-5 pb-6 pt-12 sm:px-8 md:px-20 lg:px-24",
        )}
      >
        <div className="space-y-5">
          <Skeleton className={cn(compact ? "size-9 rounded-lg" : "size-12 rounded-xl")} />
          <div className="space-y-3">
            <Skeleton className={cn("max-w-full", compact ? "h-7 w-40" : "h-10 w-72")} />
            <Skeleton className={cn(compact ? "h-3.5 w-24" : "h-4 w-40")} />
          </div>
        </div>
        <div className={cn("flex flex-wrap items-center gap-3 border-y py-3", compact && "gap-2 py-2.5")}>
          <Skeleton className={cn("rounded-md", compact ? "h-7 w-20" : "h-8 w-24")} />
          <Skeleton className={cn("rounded-md", compact ? "h-7 w-24" : "h-8 w-28")} />
          <Skeleton className={cn("rounded-md", compact ? "h-7 w-16" : "h-8 w-20")} />
        </div>
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr] border-b bg-muted/30">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className={cn("border-r last:border-r-0", compact ? "p-2.5" : "p-3")} key={index}>
                <Skeleton className={cn(compact ? "h-3.5 w-16" : "h-4 w-24")} />
              </div>
            ))}
          </div>
          {Array.from({ length: compact ? 4 : 6 }).map((_, rowIndex) => (
            <div
              className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr] border-b last:border-b-0"
              key={rowIndex}
            >
              {Array.from({ length: 4 }).map((_, columnIndex) => (
                <div
                  className={cn("border-r last:border-r-0", compact ? "p-2.5" : "p-3")}
                  key={columnIndex}
                >
                  <Skeleton
                    className={cn(
                      compact ? "h-3.5" : "h-4",
                      columnIndex === 0
                        ? compact ? "w-3/4" : "w-4/5"
                        : columnIndex === 3
                          ? compact ? "w-10" : "w-14"
                          : compact ? "w-1/2" : "w-2/3",
                    )}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DatabasePageSkeleton() {
  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col">
      <DatabasePagePreview />
    </div>
  )
}
