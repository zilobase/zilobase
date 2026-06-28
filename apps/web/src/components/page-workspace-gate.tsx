import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Building2Icon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { getApiErrorMessage } from "@/lib/api"
import { useNotelabFeatures } from "@notelab/features"
import { useActiveWorkspaceId } from "@notelab/features/integrations"
import {
  parseActiveWorkspaceMismatchError,
  pageQueryKey,
  pageQueryOptions,
} from "@notelab/features/pages"
import { useWorkspaces, useSetActiveWorkspace } from "@notelab/features/workspaces"

type PageWorkspaceGateProps = {
  children: React.ReactNode
  pageId: string
}

export function PageWorkspaceGate({
  children,
  pageId,
}: PageWorkspaceGateProps) {
  const { apiFetch, queryClient } = useNotelabFeatures()
  const activeWorkspaceId = useActiveWorkspaceId()
  const { data: workspaces = [] } = useWorkspaces()
  const setActiveWorkspace = useSetActiveWorkspace()
  const query = useQuery({
    ...pageQueryOptions(apiFetch, pageId),
    retry: (failureCount, error) => {
      if (parseActiveWorkspaceMismatchError(error)) {
        return false
      }

      return failureCount < 2
    },
  })
  const mismatch = parseActiveWorkspaceMismatchError(query.error)
  const pageWorkspaceId = query.data?.page?.workspaceId
  const hasClientMismatch = Boolean(
    pageWorkspaceId &&
      activeWorkspaceId &&
      pageWorkspaceId !== activeWorkspaceId,
  )
  const requiredWorkspaceId =
    mismatch?.workspaceId ?? (hasClientMismatch ? pageWorkspaceId : null)
  const workspace = workspaces.find(
    (item) => item.id === requiredWorkspaceId,
  )
  const workspaceLabel = workspace?.name?.trim() || "this workspace"

  const handleSwitchWorkspace = React.useCallback(async () => {
    if (!requiredWorkspaceId) {
      return
    }

    await setActiveWorkspace.mutateAsync(requiredWorkspaceId)
    await queryClient.invalidateQueries({
      queryKey: pageQueryKey(pageId),
    })
  }, [queryClient, requiredWorkspaceId, setActiveWorkspace, pageId])

  if (requiredWorkspaceId) {
    return (
      <>
        <div className="min-h-[calc(100svh-3rem)] flex-1" />
        <AlertDialog open>
          <AlertDialogContent size="default" className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Building2Icon />
              </AlertDialogMedia>
              <AlertDialogTitle>Switch workspace</AlertDialogTitle>
              <AlertDialogDescription>
                This page belongs to {workspaceLabel}. Switch to that
                workspace to open it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Link to="/dashboard">Go to dashboard</Link>
              </AlertDialogCancel>
              <Button
                disabled={setActiveWorkspace.isPending}
                onClick={() => {
                  void handleSwitchWorkspace()
                }}
              >
                {setActiveWorkspace.isPending
                  ? "Switching..."
                  : "Switch workspace"}
              </Button>
            </AlertDialogFooter>
            {setActiveWorkspace.error ? (
              <p className="text-sm text-destructive">
                {getApiErrorMessage(setActiveWorkspace.error)}
              </p>
            ) : null}
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  if (query.isPending) {
    return null
  }

  return children
}