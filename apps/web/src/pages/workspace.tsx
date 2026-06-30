import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { ArrowRight, Maximize2 } from "lucide-react"

import { AppLayout } from "@/components/app-layout"
import { WorkspaceOrganizationGate } from "@/components/workspace-organization-gate"
import {
  WorkspaceSidePaneLayout,
  WorkspaceSidePaneProvider,
  useWorkspaceSidePane,
} from "@/contexts/workspace-side-pane"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { isEmbeddedMobileViewer } from "@/lib/embedded-view"
import { cn } from "@/lib/utils"
import { formatWorkspaceBreadcrumbLabel } from "@/lib/workspace-icon"
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
  useRemoveWorkspaceEmbed,
  useWorkspace,
  useWorkspaceAccessLevel,
} from "@notelab/features/workspaces"
import { EmbeddedPageDialog } from "@/components/embedded-page-dialog"
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page"
import { useSession } from "@notelab/features/auth"
import { useUserSettings } from "@notelab/features/user-settings"
import { useWorkspaceEditorRegistry } from "@/contexts/workspace-editor-registry"
import { createWorkspaceEditorHandle } from "@/hooks/use-workspace-edit-applier"
import { Editor, type WorkspaceEditPreviewControls } from "@/packages/editor"


type WorkspaceEditorPaneProps = {
  className?: string
  databaseId?: string | null
  enableComments?: boolean
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
  const { data: workspace } = useWorkspace(workspaceId, { refetchOnMount: false })
  const { data: userSettings } = useUserSettings()
  const {
    renderedSidePaneWorkspaceId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = useWorkspaceSidePane()
  const { embeddedItemsOpenAs, openPage } = useOpenEmbeddedPage({
    contextWorkspaceId: workspaceId,
    userSettings,
    workspace,
  })

  return (
    <WorkspaceSidePaneLayout
      main={
        <WorkspaceOrganizationGate workspaceId={workspaceId}>
          <WorkspaceEditorPane
            key={workspaceId}
            onOpenPage={openPage}
            workspaceId={workspaceId}
          />
        </WorkspaceOrganizationGate>
      }
      sidePane={
        embeddedItemsOpenAs === "sidepanel" &&
        sidePaneContentReady &&
        renderedSidePaneWorkspaceId ? (
          <WorkspaceOrganizationGate workspaceId={renderedSidePaneWorkspaceId}>
            <WorkspaceEditorPane
              databaseId={sidePaneDatabaseId}
              enableComments={false}
              key={renderedSidePaneWorkspaceId}
              onOpenPage={openPage}
              workspaceId={renderedSidePaneWorkspaceId}
            />
          </WorkspaceOrganizationGate>
        ) : null
      }
      sidePaneOpen={sidePaneAnimatedOpen}
      sidePaneVisible={
        embeddedItemsOpenAs === "sidepanel" &&
        renderedSidePaneWorkspaceId !== null
      }
    />
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
  const { data: workspace } = useWorkspace(workspaceId, { refetchOnMount: false })
  const { data: userSettings } = useUserSettings()
  const {
    closeSidePane,
    renderedSidePaneWorkspaceId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = useWorkspaceSidePane()
  const { embeddedItemsOpenAs, openPage } = useOpenEmbeddedPage({
    contextWorkspaceId: workspaceId,
    userSettings,
    workspace,
  })

  return (
    <>
    <WorkspaceSidePaneLayout
      className="bg-background"
      standalone
      viewportHeightClass="h-svh"
      main={
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PublicPaneTopbar workspaceId={workspaceId} />
          <WorkspaceEditorPane
            className="min-h-0 min-w-0 flex-1 overflow-y-auto"
            key={workspaceId}
            onOpenPage={openPage}
            readOnly
            workspaceId={workspaceId}
          />
        </div>
      }
      sidePane={
        embeddedItemsOpenAs === "sidepanel" && renderedSidePaneWorkspaceId ? (
          <div className="flex h-full min-h-0 flex-col">
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
                    params={{ workspaceId: renderedSidePaneWorkspaceId }}
                    to="/workspace/$workspaceId"
                  >
                    <Maximize2 />
                  </Link>
                </Button>
              </div>
              <PublicWorkspaceBreadcrumb
                workspaceId={renderedSidePaneWorkspaceId}
              />
            </div>
            {sidePaneContentReady ? (
              <WorkspaceEditorPane
                className="min-h-0 flex-1"
                databaseId={sidePaneDatabaseId}
                enableComments={false}
                key={renderedSidePaneWorkspaceId}
                onOpenPage={openPage}
                readOnly
                workspaceId={renderedSidePaneWorkspaceId}
              />
            ) : null}
          </div>
        ) : null
      }
      sidePaneOpen={sidePaneAnimatedOpen}
      sidePaneVisible={
        embeddedItemsOpenAs === "sidepanel" &&
        renderedSidePaneWorkspaceId !== null
      }
    />
    <EmbeddedPageDialog onOpenPage={openPage} />
    </>
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
  return formatWorkspaceBreadcrumbLabel(workspace)
}

export function WorkspaceEditorPane({
  className,
  databaseId,
  enableComments = true,
  onOpenPage,
  readOnly = false,
  workspaceId,
}: WorkspaceEditorPaneProps) {
  const { data: workspace, isLoading } = useWorkspace(workspaceId)
  const { data: accessLevel } = useWorkspaceAccessLevel(workspaceId, {
    refetchOnMount: false,
  })
  const { data: userSettings } = useUserSettings()
  const createWorkspace = useCreateWorkspace()
  const embedWorkspaceItem = useEmbedWorkspaceItem()
  const removeWorkspaceEmbed = useRemoveWorkspaceEmbed()
  const updateWorkspace = useUpdateWorkspace()
  const contentSaveTimeoutRef = useRef<number | null>(null)
  const lastSavedContentRef = useRef<string | null>(null)
  const lastPageBlockIdsRef = useRef<Set<string>>(new Set())
  const pendingContentRef = useRef<unknown>(null)
  const editorContentRef = useRef<(() => unknown) | null>(null)
  const editorInstanceRef = useRef<import("@tiptap/core").Editor | null>(null)
  const workspaceEditPreviewRef =
    useRef<WorkspaceEditPreviewControls | null>(null)
  const { registerEditor, unregisterEditor } = useWorkspaceEditorRegistry()
  const [name, setName] = useState("")
  const [cover, setCover] = useState("")
  const [emoji, setEmoji] = useState("")
  const fullWidth = resolveWorkspaceFullWidth(
    workspace,
    userSettings?.workspaceFullWidth,
  )

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

      const serializedContent = serializeWorkspaceContent(content)

      if (
        serializedContent &&
        serializedContent === lastSavedContentRef.current
      ) {
        return
      }

      if (serializedContent) {
        lastSavedContentRef.current = serializedContent
      }

      const nextPageBlockIds = extractPageBlockIds(content)
      const removedPageBlockIds = [...lastPageBlockIdsRef.current].filter(
        (pageId) => !nextPageBlockIds.has(pageId),
      )

      lastPageBlockIdsRef.current = nextPageBlockIds
      for (const pageId of removedPageBlockIds) {
        removeWorkspaceEmbed.mutate({
          hostWorkspaceId: workspace.id,
          itemId: pageId,
          kind: "workspace",
        })
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
      readOnly,
      removeWorkspaceEmbed,
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
        databaseId={databaseId}
        editorContentRef={editorContentRef}
        editable={pageEditable}
        enableComments={enableComments}
        onEditorReady={(editor) => {
          editorInstanceRef.current = editor
          lastSavedContentRef.current = editor
            ? serializeWorkspaceContent(editor.getJSON())
            : null
          lastPageBlockIdsRef.current = editor
            ? extractPageBlockIds(editor.getJSON())
            : new Set()
        }}
        emoji={emoji}
        fullWidth={fullWidth}
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

function serializeWorkspaceContent(content: unknown) {
  try {
    return JSON.stringify(content)
  } catch {
    return null
  }
}

function extractPageBlockIds(content: unknown) {
  const pageIds = new Set<string>()
  collectPageBlockIds(content, pageIds)
  return pageIds
}

function collectPageBlockIds(value: unknown, pageIds: Set<string>) {
  if (!value || typeof value !== "object") {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPageBlockIds(item, pageIds)
    }
    return
  }

  const record = value as {
    attrs?: { pageId?: unknown }
    content?: unknown
    type?: unknown
  }

  if (
    record.type === "pageBlock" &&
    typeof record.attrs?.pageId === "string" &&
    record.attrs.pageId.length > 0
  ) {
    pageIds.add(record.attrs.pageId)
  }

  collectPageBlockIds(record.content, pageIds)
}
