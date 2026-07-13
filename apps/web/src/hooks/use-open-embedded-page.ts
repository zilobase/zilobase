import { useCallback } from "react"

import { usePageSidePane } from "@/contexts/page-side-pane"
import type { OpenPageSidePaneOptions } from "@/contexts/page-side-pane"
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
  type Page,
} from "@notelab/features/pages"
import {
  isPublishedFallbackPage,
  readPublishedEmbeddedItemsOpenAs,
} from "@/lib/published-page-preferences"

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

  if (isPublishedFallbackPage(page)) {
    return readPublishedEmbeddedItemsOpenAs()
  }

  return resolveEmbeddedItemsOpenAs(
    page,
    userSettings.embeddedItemsOpenAs,
  )
}

export function useOpenEmbeddedPage({
  contextPageId,
  databaseId,
  page,
}: {
  contextPageId: string | null
  databaseId?: string | null
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

  const openPage = useCallback(
    (pageId: string, options?: OpenPageSidePaneOptions) => {
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
        openEmbeddedPageDialog(pageId, {
          databaseId: options?.databaseId ?? databaseId,
        })
        return
      }

      openSidePane(pageId, {
        databaseId: options?.databaseId ?? databaseId,
      })
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

  return { openPage }
}
