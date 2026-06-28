import { useCallback } from "react"

import { usePageSidePane } from "@/contexts/page-side-pane"
import { useNotelabFeatures } from "@notelab/features"
import {
  defaultUserSettings,
  userSettingsQueryKey,
  type UserSettings,
} from "@notelab/features/user-settings"
import {
  getPageFromDetail,
  resolveEmbeddedItemsOpenAs,
  pageQueryKey,
  type EmbeddedItemsOpenAs,
  type Page,
} from "@notelab/features/pages"

function resolveOpenPagesAsFromCache(
  queryClient: ReturnType<typeof useNotelabFeatures>["queryClient"],
  hostPageId: string | null | undefined,
  fallbackPage: Page | null | undefined,
) {
  const userSettings =
    queryClient.getQueryData<UserSettings>(userSettingsQueryKey) ??
    defaultUserSettings
  const page =
    getPageFromDetail(
      queryClient.getQueryData(pageQueryKey(hostPageId)),
    ) ?? fallbackPage

  return resolveEmbeddedItemsOpenAs(
    page,
    userSettings.embeddedItemsOpenAs,
  )
}

export function useOpenEmbeddedPage({
  contextPageId,
  databaseId,
  userSettings,
  page,
}: {
  contextPageId: string | null
  databaseId?: string | null
  userSettings: UserSettings | null | undefined
  page: Page | null | undefined
}) {
  const { queryClient } = useNotelabFeatures()
  const {
    closeEmbeddedPageDialog,
    closeSidePane,
    dialogPageId,
    openEmbeddedPageDialog,
    openSidePane,
    sidePanePageId,
  } = usePageSidePane()

  const embeddedItemsOpenAs: EmbeddedItemsOpenAs = resolveEmbeddedItemsOpenAs(
    page,
    userSettings?.embeddedItemsOpenAs,
  )

  const openPage = useCallback(
    (pageId: string) => {
      const mode = resolveOpenPagesAsFromCache(
        queryClient,
        contextPageId,
        page,
      )
      const usesDialog = mode === "dialog"
      const activePageId = usesDialog ? dialogPageId : sidePanePageId
      const isCurrentlyOpen = activePageId === pageId

      if (pageId === contextPageId || isCurrentlyOpen) {
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
      contextPageId,
      databaseId,
      dialogPageId,
      openEmbeddedPageDialog,
      openSidePane,
      queryClient,
      sidePanePageId,
      page,
    ],
  )

  return { embeddedItemsOpenAs, openPage }
}

export function useResolvedOpenPagesAs(
  page: Page | null | undefined,
  userSettings: UserSettings | null | undefined,
) {
  return resolveEmbeddedItemsOpenAs(
    page,
    userSettings?.embeddedItemsOpenAs,
  )
}