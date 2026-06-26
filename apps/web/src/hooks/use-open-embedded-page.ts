import { useCallback } from "react"

import { useWorkspaceSidePane } from "@/contexts/workspace-side-pane"
import { useNotelabFeatures } from "@notelab/features"
import {
  defaultUserSettings,
  userSettingsQueryKey,
  type UserSettings,
} from "@notelab/features/user-settings"
import {
  getWorkspaceFromDetail,
  resolveEmbeddedItemsOpenAs,
  workspaceQueryKey,
  type EmbeddedItemsOpenAs,
  type Workspace,
} from "@notelab/features/workspaces"

function resolveOpenPagesAsFromCache(
  queryClient: ReturnType<typeof useNotelabFeatures>["queryClient"],
  hostWorkspaceId: string | null | undefined,
  fallbackWorkspace: Workspace | null | undefined,
) {
  const userSettings =
    queryClient.getQueryData<UserSettings>(userSettingsQueryKey) ??
    defaultUserSettings
  const workspace =
    getWorkspaceFromDetail(
      queryClient.getQueryData(workspaceQueryKey(hostWorkspaceId)),
    ) ?? fallbackWorkspace

  return resolveEmbeddedItemsOpenAs(
    workspace,
    userSettings.embeddedItemsOpenAs,
  )
}

export function useOpenEmbeddedPage({
  contextWorkspaceId,
  databaseId,
  userSettings,
  workspace,
}: {
  contextWorkspaceId: string | null
  databaseId?: string | null
  userSettings: UserSettings | null | undefined
  workspace: Workspace | null | undefined
}) {
  const { queryClient } = useNotelabFeatures()
  const {
    closeEmbeddedPageDialog,
    closeSidePane,
    dialogWorkspaceId,
    openEmbeddedPageDialog,
    openSidePane,
    sidePaneWorkspaceId,
  } = useWorkspaceSidePane()

  const embeddedItemsOpenAs: EmbeddedItemsOpenAs = resolveEmbeddedItemsOpenAs(
    workspace,
    userSettings?.embeddedItemsOpenAs,
  )

  const openPage = useCallback(
    (pageId: string) => {
      const mode = resolveOpenPagesAsFromCache(
        queryClient,
        contextWorkspaceId,
        workspace,
      )
      const usesDialog = mode === "dialog"
      const activePageId = usesDialog ? dialogWorkspaceId : sidePaneWorkspaceId
      const isCurrentlyOpen = activePageId === pageId

      if (pageId === contextWorkspaceId || isCurrentlyOpen) {
        if (usesDialog) {
          closeEmbeddedPageDialog()
        } else {
          closeSidePane()
        }
        return
      }

      if (usesDialog) {
        openEmbeddedPageDialog(pageId, { databaseId })
        return
      }

      openSidePane(pageId, { databaseId })
    },
    [
      closeEmbeddedPageDialog,
      closeSidePane,
      contextWorkspaceId,
      databaseId,
      dialogWorkspaceId,
      openEmbeddedPageDialog,
      openSidePane,
      queryClient,
      sidePaneWorkspaceId,
      workspace,
    ],
  )

  return { embeddedItemsOpenAs, openPage }
}

export function useResolvedOpenPagesAs(
  workspace: Workspace | null | undefined,
  userSettings: UserSettings | null | undefined,
) {
  return resolveEmbeddedItemsOpenAs(
    workspace,
    userSettings?.embeddedItemsOpenAs,
  )
}