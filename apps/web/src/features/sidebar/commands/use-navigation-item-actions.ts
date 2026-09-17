import { getNavigationItemPath } from "../model/database-view-navigation";
import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import { toast } from "sonner";

import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";

import {
  useCreatePage,
  useDeletePage,
  useSetPageFavorite,
  useUpdatePage,
  usePage,
  usePageAccessLevel,
  usePageNavigation,
} from "@zilobase/features/pages/react";

import {
  getNavigationItemState,
  getNavigationPendingState,
} from "../model/navigation-item-state";
import {
  useDeleteDatabase,
  useSetDatabaseFavorite,
  useUpdateDatabase,
} from "@zilobase/features/databases/react";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "@zilobase/features/user-settings/react";

import { useLayoutEditor } from "@/features/pages/layout";
import { useDatabaseMetadata } from "@/features/databases/access/use-database-metadata"

import {
  getPrimaryPageParentId,
  resolvePageFullWidth,
} from "@zilobase/features/pages/queries";
import type { ZilobaseAiMode, PageMetadata } from "@zilobase/features/pages";
import { buildPageDuplicateInput } from "../model/page-duplication";

export function useNavigationItemActions({
  databaseId,
  pageId,
  meetingId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
  meetingId?: string | null;
}) {
  const navigate = useNavigate();
  const { openLayoutEditor } = useLayoutEditor();
  const [isOpen, setIsOpen] = React.useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = React.useState(false);
  const { data: databasePayload } = useDatabaseMetadata(databaseId, {
    includeDeleted: true,
  });
  const workspaceId = useActiveWorkspaceId();
  const actionPageId = pageId ?? databasePayload?.database.pageId;
  const { data: page } = usePage(actionPageId, {
    refetchOnMount: false,
  });
  const { data: navigation } = usePageNavigation(workspaceId);
  const pages = navigation?.pages ?? [];
  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const deleteDatabase = useDeleteDatabase();
  const updateDatabase = useUpdateDatabase();
  const updatePage = useUpdatePage();
  const setFavorite = useSetPageFavorite();
  const setDatabaseFavorite = useSetDatabaseFavorite();
  const { data: userSettings } = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();

  const listPage = pages.find((item) => item.id === actionPageId);
  const isDatabasePage = Boolean(databaseId);
  const isMeetingPage = Boolean(meetingId);
  const hasPageActions = Boolean(actionPageId || databaseId);

  const pageMetadata = (page?.metadata ?? {}) as PageMetadata;
  const { data: pageAccessLevel } = usePageAccessLevel(actionPageId, {
    refetchOnMount: false,
  });
  const {
    isFavorite,
    displayName,
    lockLabel,
    locked,
    canToggleLock,
    zilobaseAiMode,
  } = getNavigationItemState({
    databaseId,
    meetingId,
    page,
    listedPage: listPage,
    database: databasePayload?.database,
    pageAccessLevel,
  });
  const effectiveFullWidth = resolvePageFullWidth(
    page,
    userSettings?.pageFullWidth,
  );

  const {
    fullWidthUpdatePending,
    isDeleting,
    lockUpdatePending,
    favoriteDisabled,
    aiModeDisabled,
  } = getNavigationPendingState(
    {
      isDatabase: isDatabasePage,
      hasDatabase: Boolean(databasePayload),
      hasPage: Boolean(page),
      hasPageId: Boolean(pageId),
    },
    {
      userSettings: updateUserSettings.isPending,
      pageUpdate: updatePage.isPending,
      databaseUpdate: updateDatabase.isPending,
      pageDelete: deletePage.isPending,
      databaseDelete: deleteDatabase.isPending,
      pageFavorite: setFavorite.isPending,
      databaseFavorite: setDatabaseFavorite.isPending,
    },
  );
  const toggleLock = () => {
    if (lockUpdatePending || !canToggleLock) {
      return;
    }

    const onError = (error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not update ${lockLabel.toLowerCase()}.`,
      );
    };

    if (isDatabasePage) {
      if (!databaseId || !databasePayload) {
        return;
      }

      updateDatabase.mutate(
        {
          databaseId,
          config: {
            ...((databasePayload.database.config ?? {}) as Record<
              string,
              unknown
            >),
            locked: !locked,
          },
        },
        { onError },
      );
      return;
    }

    if (!page) {
      return;
    }

    updatePage.mutate(
      {
        id: page.id,
        metadata: {
          ...pageMetadata,
          ...(isMeetingPage ? { meetingLocked: !locked } : { locked: !locked }),
        },
      },
      { onError },
    );
  };
  const toggleFavorite = () => {
    if (databaseId) {
      if (setDatabaseFavorite.isPending) {
        return;
      }

      setDatabaseFavorite.mutate(
        { databaseId, isFavorite: !isFavorite },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not update favorite.",
            );
          },
        },
      );
      return;
    }

    if (!pageId || setFavorite.isPending) {
      return;
    }

    setFavorite.mutate(
      { isFavorite: !isFavorite, pageId },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update favorite.",
          );
        },
      },
    );
  };
  const copyLink = async () => {
    if (!pageId && !databaseId) {
      return;
    }

    await navigator.clipboard.writeText(
      `${window.location.origin}${getNavigationItemPath({ databaseId, pageId })}`,
    );
    setIsOpen(false);
    toast.success(`${databaseId ? "Database" : "Page"} link copied.`);
  };
  const duplicatePage = async () => {
    if (!page || createPage.isPending) {
      return;
    }

    try {
      const duplicate = await createPage.mutateAsync(
        buildPageDuplicateInput(
          page,
          pageId
            ? (getPrimaryPageParentId(navigation?.placements ?? [], pageId) ??
                undefined)
            : undefined,
        ),
      );

      setIsOpen(false);
      toast.success("Page duplicated.");
      await navigate({
        to: "/p/$pageId",
        params: { pageId: duplicate.id },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not duplicate page.",
      );
    }
  };
  const moveToTrash = () => {
    if (isDatabasePage) {
      if (!databaseId || deleteDatabase.isPending) {
        return;
      }

      deleteDatabase.mutate(databaseId, {
        onSuccess: () => {
          setTrashConfirmOpen(false);
          setIsOpen(false);
          toast.success("Moved to trash.");
          void navigate({ to: "/" });
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not delete database.",
          );
        },
      });
      return;
    }

    if (!actionPageId || deletePage.isPending) {
      return;
    }

    deletePage.mutate(actionPageId, {
      onSuccess: () => {
        setTrashConfirmOpen(false);
        setIsOpen(false);
        toast.success("Moved to trash.");
        void navigate({ to: "/" });
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Could not delete page.",
        );
      },
    });
  };
  const runMoreAction = (label: string) => {
    if (label === "Customize layout") {
      setIsOpen(false);
      openLayoutEditor({ databaseId, pageId });
      return;
    }
    if (label === "Copy Link") {
      void copyLink();
      return;
    }

    if (label === "Duplicate") {
      void duplicatePage();
      return;
    }

    if (label === "Move to Trash") {
      setTrashConfirmOpen(true);
    }
  };
  const togglePageFullWidth = () => {
    if (isDatabasePage || fullWidthUpdatePending) {
      return;
    }

    updateUserSettings.mutate(
      { pageFullWidth: !userSettings?.pageFullWidth },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update full width setting.",
          );
        },
      },
    );
  };

  const setZilobaseAiMode = (mode: ZilobaseAiMode) => {
    if (!page || updatePage.isPending) {
      return;
    }

    updatePage.mutate(
      {
        id: page.id,
        metadata: {
          ...pageMetadata,
          zilobaseai: zilobaseAiMode === mode ? null : mode,
        },
      },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update Zilobase AI setting.",
          );
        },
      },
    );
  };

  return {
    item: {
      pageId: actionPageId,
      workspaceId,
      displayName,
      isDatabase: isDatabasePage,
      hasActions: hasPageActions,
    },
    favorite: {
      active: isFavorite,
      disabled: favoriteDisabled,
      toggle: toggleFavorite,
    },
    lock: {
      canToggle: canToggleLock,
      pending: lockUpdatePending,
      active: locked,
      label: lockLabel,
      toggle: toggleLock,
    },
    layout: {
      pending: fullWidthUpdatePending,
      fullWidth: effectiveFullWidth,
      toggle: togglePageFullWidth,
    },
    aiMode: {
      disabled: aiModeDisabled,
      value: zilobaseAiMode,
      set: setZilobaseAiMode,
    },
    moreMenu: {
      open: isOpen,
      setOpen: setIsOpen,
      run: runMoreAction,
      isDisabled: (label: string) => {
        switch (label) {
          case "Copy Link":
            return !pageId && !databaseId;
          case "Duplicate":
            return isDatabasePage || !page || createPage.isPending;
          case "Move to Trash":
            return (!actionPageId && !databaseId) || isDeleting;
          default:
            return false;
        }
      },
    },
    trash: {
      open: trashConfirmOpen,
      setOpen: setTrashConfirmOpen,
      pending: isDeleting,
      confirm: moveToTrash,
    },
  };
}
