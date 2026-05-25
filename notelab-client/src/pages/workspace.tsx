import { useEffect, useState } from "react"
import { useParams } from "@tanstack/react-router"

import { Spinner } from "@/components/ui/spinner"
import {
  getWorkspaceEmoji,
  type WorkspaceMetadata,
} from "@/features/workspaces/queries"
import {
  useUpdateWorkspace,
  useWorkspace,
} from "@/features/workspaces/hooks"
import { Editor } from "@/packages/editor"

export default function WorkspacePage() {
  const { workspaceId } = useParams({ from: "/app/workspace/$workspaceId" })
  const { data: workspace, isLoading } = useWorkspace(workspaceId)
  const updateWorkspace = useUpdateWorkspace()
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("📝")

  useEffect(() => {
    if (!workspace) {
      return
    }

    setName(workspace.name)
    setEmoji(getWorkspaceEmoji(workspace))
  }, [workspace])

  useEffect(() => {
    if (!workspace || name.trim() === "" || name === workspace.name) {
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

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Spinner />
      </main>
    )
  }

  if (!workspace) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
        Workspace not found.
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col">
      <Editor
        key={workspace.id}
        content={workspace.content ?? ""}
        emoji={emoji}
        onEmojiChange={updateEmoji}
        onTitleChange={setName}
        title={name}
      />
    </main>
  )
}
