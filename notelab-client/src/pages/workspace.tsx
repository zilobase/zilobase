import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "@tanstack/react-router"

import {
  getWorkspaceSidePaneWidthClass,
  useWorkspaceSidePane,
} from "@/components/app-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  getWorkspaceEmoji,
  type WorkspaceMetadata,
} from "@/features/workspaces/queries"
import {
  useUpdateWorkspace,
  useCreateWorkspace,
  useWorkspace,
  useWorkspaceAccessLevel,
} from "@/features/workspaces/hooks"
import { useUserSettings } from "@/features/user-settings/hooks"
import { Editor } from "@/packages/editor"

type WorkspaceEditorPaneProps = {
  className?: string
  onOpenPage: (pageId: string) => void
  workspaceId: string
}

export default function WorkspacePage() {
  const { workspaceId } = useParams({ from: "/app/workspace/$workspaceId" })
  const { closeSidePane, openSidePane, sidePaneWorkspaceId } =
    useWorkspaceSidePane()
  const sidePaneWidthClass = getWorkspaceSidePaneWidthClass()

  const openPageInSidePane = useCallback((pageId: string) => {
    if (pageId === workspaceId || pageId === sidePaneWorkspaceId) {
      closeSidePane()
      return
    }

    openSidePane(pageId)
  }, [closeSidePane, openSidePane, sidePaneWorkspaceId, workspaceId])

  return (
    <main className="relative flex h-full min-h-[calc(100svh-3rem)] flex-1 overflow-hidden">
      <WorkspaceEditorPane
        className="min-w-0 flex-1 overflow-y-auto"
        key={workspaceId}
        onOpenPage={openPageInSidePane}
        workspaceId={workspaceId}
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

export function WorkspaceEditorPane({
  className,
  onOpenPage,
  workspaceId,
}: WorkspaceEditorPaneProps) {
  const { data: workspace, isLoading } = useWorkspace(workspaceId)
  const { data: accessLevel } = useWorkspaceAccessLevel(workspaceId)
  const { data: userSettings } = useUserSettings()
  const createWorkspace = useCreateWorkspace()
  const updateWorkspace = useUpdateWorkspace()
  const contentSaveTimeoutRef = useRef<number | null>(null)
  const pendingContentRef = useRef<unknown>(null)
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("")

  const flushContentSaveTimeout = useCallback(() => {
    if (contentSaveTimeoutRef.current === null) {
      return
    }

    window.clearTimeout(contentSaveTimeoutRef.current)
    contentSaveTimeoutRef.current = null

    if (workspace && pendingContentRef.current !== null) {
      updateWorkspace.mutate({
        id: workspace.id,
        content: pendingContentRef.current,
      })
      pendingContentRef.current = null
    }
  }, [updateWorkspace, workspace])

  const clearContentSaveTimeout = useCallback(() => {
    if (contentSaveTimeoutRef.current === null) {
      return
    }

    window.clearTimeout(contentSaveTimeoutRef.current)
    contentSaveTimeoutRef.current = null
    pendingContentRef.current = null
  }, [])

  useEffect(() => {
    if (!workspace) {
      return
    }

    setName(workspace.name)
    setEmoji(getWorkspaceEmoji(workspace) ?? "")
  }, [workspace])

  useEffect(() => {
    return flushContentSaveTimeout
  }, [flushContentSaveTimeout, workspaceId])

  useEffect(() => {
    if (
      !workspace ||
      (accessLevel !== "edit" && accessLevel !== "full") ||
      name.trim() === workspace.name
    ) {
      return
    }

    const timeout = window.setTimeout(() => {
      updateWorkspace.mutate({ id: workspace.id, name: name.trim() })
    }, 600)

    return () => window.clearTimeout(timeout)
  }, [accessLevel, name, updateWorkspace, workspace])

  const updateEmoji = (nextEmoji: string) => {
    setEmoji(nextEmoji)

    if (!workspace || (accessLevel !== "edit" && accessLevel !== "full")) {
      return
    }

    updateWorkspace.mutate({
      id: workspace.id,
      metadata: {
        ...((workspace.metadata ?? {}) as WorkspaceMetadata),
        emoji: nextEmoji,
      },
    })
  }

  const updateContent = useCallback(
    (content: unknown) => {
      if (!workspace) {
        return
      }
      if (accessLevel !== "edit" && accessLevel !== "full") {
        return
      }

      clearContentSaveTimeout()
      pendingContentRef.current = content

      contentSaveTimeoutRef.current = window.setTimeout(() => {
        updateWorkspace.mutate({ id: workspace.id, content })
        contentSaveTimeoutRef.current = null
        pendingContentRef.current = null
      }, 800)
    },
    [accessLevel, clearContentSaveTimeout, updateWorkspace, workspace],
  )

  const createNestedPage = useCallback(async () => {
    if (!workspace || (accessLevel !== "edit" && accessLevel !== "full")) {
      throw new Error("Workspace is required")
    }

    return createWorkspace.mutateAsync({
      content: "",
      emoji: "",
      name: "",
      organizationId: workspace.organizationId,
      parentWorkspaceId: workspace.id,
    })
  }, [accessLevel, createWorkspace, workspace])

  if (isLoading) {
    return (
      <section className={cn(className, "animate-in fade-in duration-200")}>
        <WorkspaceEditorSkeleton
          fullWidth={Boolean(userSettings?.workspaceFullWidth)}
        />
      </section>
    )
  }

  if (!workspace) {
    return (
      <section
        className={`${className ?? ""} flex items-center justify-center px-4 text-sm text-muted-foreground`}
      >
        Workspace not found.
      </section>
    )
  }

  return (
    <section className={cn(className, "animate-in fade-in-0 duration-300")}>
      <Editor
        key={workspace.id}
        content={workspace.content ?? ""}
        editable={accessLevel === "edit" || accessLevel === "full"}
        emoji={emoji}
        fullWidth={Boolean(userSettings?.workspaceFullWidth)}
        onContentChange={updateContent}
        onCreatePage={createNestedPage}
        onEmojiChange={updateEmoji}
        onOpenPage={onOpenPage}
        onTitleChange={setName}
        organizationId={workspace.organizationId}
        title={name}
        workspaceId={workspace.id}
      />
    </section>
  )
}

function WorkspaceEditorSkeleton({ fullWidth }: { fullWidth: boolean }) {
  return (
    <div className="flex min-h-full w-full flex-col">
      <div
        className={cn(
          "w-full px-5 py-6 sm:px-8 md:px-20 md:py-8 lg:px-24",
          fullWidth ? "" : "mx-auto max-w-5xl",
        )}
      >
        <div className="space-y-8">
          <div className="space-y-5">
            <Skeleton className="size-12 rounded-xl" />
            <div className="space-y-3">
              <Skeleton className="h-10 w-2/3 max-w-md" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="space-y-3 pt-2">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  )
}
