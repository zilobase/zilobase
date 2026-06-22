import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { ArrowRight, Maximize2 } from "lucide-react"

import { AppLayout } from "@/components/app-layout"
import {
  getWorkspaceSidePaneWidthClass,
  WorkspaceSidePaneProvider,
  useWorkspaceSidePane,
} from "@/contexts/workspace-side-pane"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { isEmbeddedMobileViewer } from "@/lib/embedded-view"
import { cn } from "@/lib/utils"
import {
  getWorkspaceCover,
  getWorkspaceEmoji,
  readParentItemId,
  resolveWorkspaceFullWidth,
  type WorkspaceMetadata,
} from "@notelab/features/workspaces"
import {
  useUpdateWorkspace,
  useCreateWorkspace,
  useEmbedWorkspaceItem,
  useWorkspaceRealtime,
  useWorkspace,
  useWorkspaceAccessLevel,
} from "@notelab/features/workspaces"
import { useSession } from "@notelab/features/auth"
import { useUserSettings } from "@notelab/features/user-settings"
import { useWorkspaceEditorRegistry } from "@/contexts/workspace-editor-registry"
import { createWorkspaceEditorHandle } from "@/hooks/use-workspace-edit-applier"
import { Editor, type WorkspaceEditPreviewControls } from "@/packages/editor"
import { useWorkspaceContentSnapshot } from "@/packages/editor/use-workspace-content-snapshot"

type WorkspaceEditorPaneProps = {
  className?: string
  onOpenPage: (pageId: string) => void
  readOnly?: boolean
  workspaceId: string
}

export default function WorkspacePage() {
  const { data: session } = useSession()

  if (!session?.user) {
    return <PublicWorkspacePage />
  }

  return (
    <AppLayout>
      <AuthenticatedWorkspacePage />
    </AppLayout>
  )
}

function AuthenticatedWorkspacePage() {
  const { workspaceId } = useParams({ from: "/workspace/$workspaceId" })
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

function PublicWorkspacePage() {
  const { workspaceId } = useParams({ from: "/workspace/$workspaceId" })

  return (
    <WorkspaceSidePaneProvider resetKey={workspaceId}>
      <PublicWorkspaceContent workspaceId={workspaceId} />
    </WorkspaceSidePaneProvider>
  )
}

function PublicWorkspaceContent({ workspaceId }: { workspaceId: string }) {
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
    <main className="relative flex h-svh flex-1 overflow-hidden bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <PublicPaneTopbar workspaceId={workspaceId} />
        <WorkspaceEditorPane
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
          key={workspaceId}
          onOpenPage={openPageInSidePane}
          readOnly
          workspaceId={workspaceId}
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

export function PublicPaneTopbar({
  workspaceId,
}: {
  workspaceId: string | null
}) {
  if (isEmbeddedMobileViewer()) {
    return null
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <PublicWorkspaceBreadcrumb workspaceId={workspaceId} />
      <PublicLoginButton />
    </header>
  )
}

export function PublicWorkspaceBreadcrumb({
  workspaceId,
}: {
  workspaceId: string | null
}) {
  if (!workspaceId) {
    return null
  }

  return (
    <nav className="min-w-0 flex-1 text-sm" aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1 text-muted-foreground">
        <PublicWorkspaceBreadcrumbAncestors workspaceId={workspaceId} />
      </ol>
    </nav>
  )
}

function PublicWorkspaceBreadcrumbAncestors({
  workspaceId,
}: {
  workspaceId: string
}) {
  const { data: workspace } = useWorkspace(workspaceId)
  const parentItemId = readParentItemId(workspace?.metadata) ?? null

  return (
    <>
      {parentItemId ? (
        <>
          <PublicWorkspaceBreadcrumbAncestors
            workspaceId={parentItemId}
          />
          <li className="shrink-0">/</li>
        </>
      ) : null}
      <li className="min-w-0">
        <Link
          className="block max-w-48 truncate text-foreground hover:underline sm:max-w-72"
          params={{ workspaceId }}
          to="/workspace/$workspaceId"
        >
          {workspace ? getWorkspaceBreadcrumbLabel(workspace) : "Workspace"}
        </Link>
      </li>
    </>
  )
}

function PublicLoginButton() {
  return (
    <Button asChild size="sm" variant="outline">
      <Link to="/login">Login</Link>
    </Button>
  )
}

function getWorkspaceBreadcrumbLabel(
  workspace: NonNullable<ReturnType<typeof useWorkspace>["data"]>,
) {
  const label = workspace.name.trim() || "Untitled"
  const emoji = getWorkspaceEmoji(workspace)

  return emoji ? `${emoji} ${label}` : label
}

export function WorkspaceEditorPane({
  className,
  onOpenPage,
  readOnly = false,
  workspaceId,
}: WorkspaceEditorPaneProps) {
  const { data: session } = useSession()
  const { data: workspace, isLoading } = useWorkspace(workspaceId)
  const { data: accessLevel } = useWorkspaceAccessLevel(workspaceId, {
    refetchOnMount: false,
  })
  const { data: userSettings } = useUserSettings()
  const createWorkspace = useCreateWorkspace()
  const embedWorkspaceItem = useEmbedWorkspaceItem()
  const updateWorkspace = useUpdateWorkspace()
  const contentSaveTimeoutRef = useRef<number | null>(null)
  const pendingContentRef = useRef<unknown>(null)
  const editorContentRef = useRef<(() => unknown) | null>(null)
  const editorInstanceRef = useRef<import("@tiptap/core").Editor | null>(null)
  const workspaceEditPreviewRef =
    useRef<WorkspaceEditPreviewControls | null>(null)
  const { registerEditor, unregisterEditor } = useWorkspaceEditorRegistry()
  const [collaborationReady, setCollaborationReady] = useState(false)
  const [name, setName] = useState("")
  const [cover, setCover] = useState("")
  const [emoji, setEmoji] = useState("")
  const fullWidth = resolveWorkspaceFullWidth(
    workspace,
    userSettings?.workspaceFullWidth,
  )

  useWorkspaceRealtime(workspaceId, {
    enabled: Boolean(session?.user && workspace),
    organizationId: workspace?.organizationId,
  })

  const { scheduleSnapshot } = useWorkspaceContentSnapshot({
    enabled: collaborationReady,
    getContent: () => editorContentRef.current?.() ?? null,
    workspaceId: workspace?.id,
  })

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

  const workspaceCover = workspace ? getWorkspaceCover(workspace) ?? "" : ""
  const workspaceEmoji = workspace ? getWorkspaceEmoji(workspace) ?? "" : ""

  useEffect(() => {
    if (!workspace) {
      return
    }

    setName(workspace.name)
    setCover(workspaceCover)
    setEmoji(workspaceEmoji)
  }, [workspace, workspace?.name, workspace?.updatedAt, workspaceCover, workspaceEmoji])

  useEffect(() => {
    return flushContentSaveTimeout
  }, [flushContentSaveTimeout, workspaceId])

  const pageEditable =
    !readOnly && (accessLevel === "edit" || accessLevel === "full")

  useEffect(() => {
    if (
      readOnly ||
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
  }, [accessLevel, name, readOnly, updateWorkspace, workspace])

  const updateCover = (nextCover: string) => {
    setCover(nextCover)

    if (
      readOnly ||
      !workspace ||
      (accessLevel !== "edit" && accessLevel !== "full")
    ) {
      return
    }

    updateWorkspace.mutate({
      id: workspace.id,
      metadata: {
        ...((workspace.metadata ?? {}) as WorkspaceMetadata),
        cover: nextCover,
      },
    })
  }

  const updateEmoji = (nextEmoji: string) => {
    setEmoji(nextEmoji)

    if (
      readOnly ||
      !workspace ||
      (accessLevel !== "edit" && accessLevel !== "full")
    ) {
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
      if (
        readOnly ||
        (accessLevel !== "edit" && accessLevel !== "full")
      ) {
        return
      }

      if (collaborationReady) {
        scheduleSnapshot()
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
    [
      accessLevel,
      clearContentSaveTimeout,
      collaborationReady,
      readOnly,
      scheduleSnapshot,
      updateWorkspace,
      workspace,
    ],
  )

  useEffect(() => {
    registerEditor(
      workspaceId,
      createWorkspaceEditorHandle({
        editable: pageEditable,
        getEditor: () => editorInstanceRef.current,
        onContentChange: updateContent,
        workspaceEditPreviewRef,
      }),
    )

    return () => {
      unregisterEditor(workspaceId)
    }
  }, [
    pageEditable,
    registerEditor,
    unregisterEditor,
    updateContent,
    workspaceId,
  ])

  const embedLinkedPage = useCallback(
    async (pageId: string) => {
      if (!workspace) {
        return
      }

      await embedWorkspaceItem.mutateAsync({
        hostWorkspaceId: workspace.id,
        itemId: pageId,
        kind: "workspace",
      })
    },
    [embedWorkspaceItem, workspace],
  )

  const createNestedPage = useCallback(async () => {
    if (
      readOnly ||
      !workspace ||
      (accessLevel !== "edit" && accessLevel !== "full")
    ) {
      throw new Error("Workspace is required")
    }

    return createWorkspace.mutateAsync({
      content: "",
      emoji: "",
      name: "",
      organizationId: workspace.organizationId,
      parentItemId: workspace.id,
    })
  }, [accessLevel, createWorkspace, readOnly, workspace])

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
        cover={cover}
        editorContentRef={editorContentRef}
        editable={pageEditable}
        onEditorReady={(editor) => {
          editorInstanceRef.current = editor
        }}
        emoji={emoji}
        fullWidth={fullWidth}
        onCollaborationReadyChange={setCollaborationReady}
        onContentChange={updateContent}
        onCoverChange={updateCover}
        onCreatePage={createNestedPage}
        onEmbedPage={embedLinkedPage}
        onEmojiChange={updateEmoji}
        onOpenPage={onOpenPage}
        onTitleChange={setName}
        organizationId={workspace.organizationId}
        title={name}
        workspaceEditPreviewRef={workspaceEditPreviewRef}
        workspaceId={workspace.id}
        workspaceUpdatedAt={workspace.updatedAt}
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
