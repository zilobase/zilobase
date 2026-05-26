import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { useParams } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  getWorkspaceEmoji,
  type WorkspaceMetadata,
} from "@/features/workspaces/queries"
import {
  useUpdateWorkspace,
  useCreateWorkspace,
  useWorkspace,
} from "@/features/workspaces/hooks"
import { Editor } from "@/packages/editor"

type WorkspaceEditorPaneProps = {
  className?: string
  onOpenPage: (pageId: string) => void
  workspaceId: string
}

export default function WorkspacePage() {
  const { workspaceId } = useParams({ from: "/app/workspace/$workspaceId" })
  const [sidePaneWorkspaceId, setSidePaneWorkspaceId] = useState<string | null>(
    null,
  )

  useEffect(() => {
    setSidePaneWorkspaceId(null)
  }, [workspaceId])

  const openPageInSidePane = useCallback((pageId: string) => {
    setSidePaneWorkspaceId(pageId)
  }, [])

  return (
    <main className="flex h-full min-h-[calc(100svh-3rem)] flex-1 overflow-hidden">
      <WorkspaceEditorPane
        className="min-w-0 flex-1 overflow-y-auto"
        key={workspaceId}
        onOpenPage={openPageInSidePane}
        workspaceId={workspaceId}
      />
      {sidePaneWorkspaceId ? (
        <aside
          className="animate-in slide-in-from-right-8 flex w-[min(48rem,48vw)] min-w-[24rem] shrink-0 flex-col border-l bg-background duration-200"
          key={sidePaneWorkspaceId}
        >
          <div className="flex h-10 shrink-0 items-center justify-end border-b px-2">
            <Button
              aria-label="Close pane"
              onClick={() => setSidePaneWorkspaceId(null)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
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

function WorkspaceEditorPane({
  className,
  onOpenPage,
  workspaceId,
}: WorkspaceEditorPaneProps) {
  const { data: workspace, isLoading } = useWorkspace(workspaceId)
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
    if (!workspace || name.trim() === workspace.name) {
      return
    }

    const timeout = window.setTimeout(() => {
      updateWorkspace.mutate({ id: workspace.id, name: name.trim() })
    }, 600)

    return () => window.clearTimeout(timeout)
  }, [name, updateWorkspace, workspace])

  const updateEmoji = (nextEmoji: string) => {
    setEmoji(nextEmoji)

    if (!workspace) {
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

      clearContentSaveTimeout()
      pendingContentRef.current = content

      contentSaveTimeoutRef.current = window.setTimeout(() => {
        updateWorkspace.mutate({ id: workspace.id, content })
        contentSaveTimeoutRef.current = null
        pendingContentRef.current = null
      }, 800)
    },
    [clearContentSaveTimeout, updateWorkspace, workspace],
  )

  const createNestedPage = useCallback(async () => {
    if (!workspace) {
      throw new Error("Workspace is required")
    }

    return createWorkspace.mutateAsync({
      content: "",
      emoji: "",
      name: "",
      organizationId: workspace.organizationId,
      parentWorkspaceId: workspace.id,
    })
  }, [createWorkspace, workspace])

  if (isLoading) {
    return (
      <section className={`${className ?? ""} flex items-center justify-center`}>
        <Spinner />
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
    <section className={className}>
      <Editor
        key={workspace.id}
        content={workspace.content ?? ""}
        emoji={emoji}
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
