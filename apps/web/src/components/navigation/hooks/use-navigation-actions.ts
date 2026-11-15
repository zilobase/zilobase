import {
  getNavigationItemPath,
  getActivePageId as getSidebarPageId,
  getActiveDatabaseId as getSidebarDatabaseId,
} from "@/app/routing/route-identifiers";
import * as React from "react";
import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useDeleteDatabase } from "@zilobase/features/databases/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import {
  useDeletePage,
  useConvertPageToTeamspace,
  useMovePageToTeamspace,
  useItemActionController,
} from "@zilobase/features/pages/react";
import { useTeamspaces } from "@zilobase/features/teamspaces/react";
import { toast } from "sonner";
import { useSidebar } from "@/components/ui/sidebar";
import { useOpenInNewTab } from "@/sections/desktop/tabs/components/desktop-tabs";
import { type SidebarNavItem } from "@zilobase/features/pages";
import { usePageDesignEditor } from "@/sections/pages/design/components/page-design-editor";

export function useHeaderActions({
  databaseId,
  pageId,
  meetingId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
  meetingId?: string | null;
}) {
  const navigate = useNavigate();
  const { openLayoutEditor } = usePageDesignEditor();
  const [isOpen, setIsOpen] = React.useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = React.useState(false);
  const actions = useItemActionController({ databaseId, pageId, meetingId });
  const {
    actionPageId,
    workspaceId,
    page,
    databasePayload,
    isDatabasePage,
    hasPageActions,
    isFavorite,
    displayName,
    lockLabel,
    locked,
    canToggleLock,
    effectiveFullWidth,
    createPage,
    deletePage,
    deleteDatabase,
    updateDatabase,
    updatePage,
    setFavorite,
    setDatabaseFavorite,
    updateUserSettings,
  } = actions;

  const { fullWidthUpdatePending, isDeleting, lockUpdatePending, favoriteDisabled } =
    getNavigationPendingState(
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
  const toggleLock = () =>
    actions.toggleLock({
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : `Could not update ${lockLabel.toLowerCase()}.`,
        ),
    });
  const toggleFavorite = () =>
    actions.toggleFavorite({
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Could not update favorite."),
    });
  const copyLink = async () => {
    if (!pageId && !databaseId) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}${getNavigationItemPath({ databaseId, pageId })}`,
    );
    setIsOpen(false);
    toast.success(`${databaseId ? "Database" : "Page"} link copied.`);
  };
  const duplicatePage = async () => {
    try {
      const duplicate = await actions.duplicatePage();
      if (!duplicate) return;
      setIsOpen(false);
      toast.success("Page duplicated.");
      await navigate({ to: "/p/$pageId", params: { pageId: duplicate.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate page.");
    }
  };
  const moveToTrash = () =>
    actions.moveToTrash({
      onSuccess: () => {
        setTrashConfirmOpen(false);
        setIsOpen(false);
        toast.success("Moved to trash.");
        void navigate({ to: "/" });
      },
      onError: (error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : databaseId
              ? "Could not delete database."
              : "Could not delete page.",
        ),
    });
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
  const togglePageFullWidth = () =>
    actions.togglePageFullWidth({
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not update full width setting.",
        ),
    });

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

export function getNavigationPendingState(
  item: {
    isDatabase: boolean;
    hasDatabase: boolean;
    hasPage: boolean;
    hasPageId: boolean;
  },
  pending: {
    userSettings: boolean;
    pageUpdate: boolean;
    databaseUpdate: boolean;
    pageDelete: boolean;
    databaseDelete: boolean;
    pageFavorite: boolean;
    databaseFavorite: boolean;
  },
) {
  return {
    fullWidthUpdatePending: pending.userSettings || pending.pageUpdate,
    isDeleting: pending.pageDelete || pending.databaseDelete,
    lockUpdatePending: item.isDatabase ? pending.databaseUpdate : pending.pageUpdate,
    favoriteDisabled: item.isDatabase
      ? !item.hasDatabase || pending.databaseFavorite
      : !item.hasPageId || pending.pageFavorite,
  };
}

export function useSidebarEntryActions(item: SidebarNavItem<unknown>) {
  const workspaceId = useActiveWorkspaceId();
  const { isMobile } = useSidebar();
  const openInNewTab = useOpenInNewTab();
  const location = useLocation();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deletePage = useDeletePage();
  const deleteDatabase = useDeleteDatabase();
  const movePage = useMovePageToTeamspace();
  const convertPage = useConvertPageToTeamspace();
  const { data: teamspaces = [] } = useTeamspaces(workspaceId);
  const activePageId = getSidebarPageId(location.pathname);
  const activeDatabaseId = getSidebarDatabaseId(location.pathname);
  const linkPath = getNavigationItemPath({
    databaseId: item.isDatabase || item.isDatabaseView ? item.databaseId : null,
    pageId: item.pageId,
  });
  const displayName = item.name.trim() || "Untitled";
  const isDeleting = deletePage.isPending || deleteDatabase.isPending;

  const redirectIfDeleted = (result: {
    deletedDatabaseIds: string[];
    deletedPageIds: string[];
  }) => {
    const deletedActivePage = activePageId && result.deletedPageIds.includes(activePageId);
    const deletedActiveDatabase =
      activeDatabaseId && result.deletedDatabaseIds.includes(activeDatabaseId);

    if (deletedActivePage || deletedActiveDatabase) {
      void navigate({ to: "/" });
    }
  };

  const runDelete = () => {
    if (item.isDatabase && item.databaseId) {
      deleteDatabase.mutate(item.databaseId, {
        onSuccess: (result) => {
          setConfirmOpen(false);
          toast.success("Moved to trash.");
          redirectIfDeleted(result);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Could not delete database.");
        },
      });
      return;
    }

    if (!item.pageId) {
      return;
    }

    deletePage.mutate(item.pageId, {
      onSuccess: (result) => {
        setConfirmOpen(false);
        toast.success("Moved to trash.");
        redirectIfDeleted(result);
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Could not delete page.");
      },
    });
  };

  return {
    workspaceId,
    isMobile,
    openInNewTab,
    confirmOpen,
    setConfirmOpen,
    movePage,
    convertPage,
    teamspaces,
    displayName,
    isDeleting,
    linkPath,
    runDelete,
  };
}

export async function copySidebarEntryLink(path: string) {
  try {
    await navigator.clipboard?.writeText(`${window.location.origin}${path}`);
  } catch {}
}
