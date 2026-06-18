import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { getApiErrorMessage } from "@/lib/api"
import { useNotelabFeatures } from "@notelab/features"
import {
  useUpdateWorkspace,
  workspaceQueryKey,
  type NotelabAiMode,
  type NotelabAiWorkspaceSummary,
  type Workspace,
  type WorkspaceMetadata,
} from "@notelab/features/workspaces"

const modeLabels: Record<NotelabAiMode, string> = {
  instruction: "instruction",
  skill: "skill",
}

export function NotelabAiItem({
  mode,
  workspace,
}: {
  mode: NotelabAiMode
  workspace: NotelabAiWorkspaceSummary
}) {
  const { apiFetch, queryClient } = useNotelabFeatures()
  const updateWorkspace = useUpdateWorkspace()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const isRemoving = updateWorkspace.isPending

  const remove = async () => {
    let metadata: WorkspaceMetadata = {}

    const cached = queryClient.getQueryData<Workspace | null>(
      workspaceQueryKey(workspace.id),
    )

    if (cached?.metadata) {
      metadata = cached.metadata
    } else {
      const result = await apiFetch<{ workspace: Workspace }>(
        `/workspaces/${workspace.id}`,
        { method: "GET" },
      )
      metadata = result.workspace.metadata ?? {}
    }

    updateWorkspace.mutate(
      {
        id: workspace.id,
        metadata: {
          ...metadata,
          notelabai: null,
        },
      },
      {
        onSuccess: () => {
          setConfirmOpen(false)
          toast.success(`Removed as ${modeLabels[mode]}.`)
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error))
        },
      },
    )
  }

  return (
    <>
      <Item variant="outline">
        <ItemMedia className="size-10 rounded-lg border bg-background text-lg">
          {workspace.metadata.emoji ?? "📄"}
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="truncate">
            <Link
              className="hover:underline"
              params={{ workspaceId: workspace.id }}
              to="/workspace/$workspaceId"
            >
              {workspace.name || "Untitled"}
            </Link>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <Button
            aria-label={`Remove as ${modeLabels[mode]}`}
            disabled={isRemoving}
            onClick={() => setConfirmOpen(true)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {isRemoving ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <XIcon />
            )}
          </Button>
        </ItemActions>
      </Item>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {modeLabels[mode]}</AlertDialogTitle>
            <AlertDialogDescription>
              Remove as {modeLabels[mode]}? This page will become a normal
              workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()} variant="destructive">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function NotelabAiItemGroup({
  children,
}: {
  children: React.ReactNode
}) {
  return <ItemGroup className="gap-2">{children}</ItemGroup>
}