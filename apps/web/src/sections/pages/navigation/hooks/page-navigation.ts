import { isMobileViewport } from "@/hooks/use-mobile";
import { useCallback } from "react";
import { markPageNavigationStart } from "../lib/page-navigation-timing";

import { usePageSidePane } from "@/sections/pages/presentation/components/page-presentation";
import type { OpenPageSidePaneOptions } from "@/sections/pages/presentation/components/page-presentation";
import { useZilobaseFeatures } from "@zilobase/features";
import { resolveEmbeddedItemsOpenAsFromCache, type Page } from "@zilobase/features/pages";
import { readCachedPage } from "@zilobase/features/pages";
import { readPublishedEmbeddedItemsOpenAs } from "../../access/lib/public-page-opening-preferences";
import { useOptionalPageCommentsRegistry } from "../../editor/comments/components/comments-context";
import { useOpenInNewTab } from "@/sections/desktop/tabs/components/desktop-tabs";

export function useOpenEmbeddedPage({
  contextPageId,
  databaseId,
  page,
}: {
  contextPageId: string | null;
  databaseId?: string | null;
  page: Page | null | undefined;
}) {
  const { queryClient } = useZilobaseFeatures();
  const comments = useOptionalPageCommentsRegistry();
  const openNewTab = useOpenInNewTab();
  const {
    closeEmbeddedPageDialog,
    closeSidePane,
    dialogPageId,
    openEmbeddedPageDialog,
    openPageInMainPane,
    openSidePane,
    sidePanePageId,
  } = usePageSidePane();

  const openPage = useCallback(
    (pageId: string, options?: OpenPageOptions) => {
      if (options?.focusComment) comments?.requestFocus(pageId);
      if (isMobileViewport()) {
        openPageInMainPane(pageId, { databaseId: options?.databaseId ?? databaseId });
        return;
      }
      if (options?.presentation === "newtab") {
        openNewTab({
          href: `/p/${encodeURIComponent(pageId)}`,
          title: readCachedPage(queryClient, pageId)?.name || "Untitled",
        });
        return;
      }
      if (options?.presentation === "fullpage") {
        openPageInMainPane(pageId, { databaseId: options?.databaseId ?? databaseId });
        return;
      }
      const mode = resolveEmbeddedItemsOpenAsFromCache(
        queryClient,
        contextPageId,
        page,
        readPublishedEmbeddedItemsOpenAs,
      );
      const usesDialog = (options?.presentation ?? mode) === "dialog";
      const activePageId = usesDialog ? dialogPageId : sidePanePageId;
      const isCurrentlyOpen = activePageId === pageId;

      if (
        (pageId === contextPageId || isCurrentlyOpen) &&
        !options?.presentation &&
        !options?.focusComment
      ) {
        if (usesDialog) {
          closeEmbeddedPageDialog();
        } else {
          closeSidePane();
        }
        return;
      }

      markPageNavigationStart(pageId);

      if (usesDialog) {
        openEmbeddedPageDialog(pageId, {
          databaseId: options?.databaseId ?? databaseId,
          focusTitle: options?.focusTitle,
        });
        return;
      }

      openSidePane(pageId, { databaseId: options?.databaseId ?? databaseId });
    },
    [
      closeEmbeddedPageDialog,
      closeSidePane,
      contextPageId,
      databaseId,
      dialogPageId,
      openEmbeddedPageDialog,
      openPageInMainPane,
      openSidePane,
      queryClient,
      comments,
      openNewTab,
      sidePanePageId,
      page,
    ],
  );

  return { openPage };
}

export type OpenPageOptions = OpenPageSidePaneOptions & {
  presentation?: "dialog" | "sidepanel" | "fullpage" | "newtab";
  focusComment?: boolean;
};
