import { ChevronDown, ChevronsRight, ChevronUp, Maximize2, XIcon } from "@/components/icons";
import { AppBreadcrumbs } from "@/components/navigation/components/breadcrumbs";
import { Link } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { HeaderActions } from "@/components/navigation/components/navigation-actions";
import { useOptionalPageSidePane } from "@/sections/pages/presentation/components/page-presentation";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDatabaseBootstrap, useDatabaseRecords } from "@zilobase/features/databases/react";
import { useMeeting } from "@zilobase/features/meetings/react";
import { resolveEmbeddedItemsOpenAs, type EmbeddedItemsOpenAs } from "@zilobase/features/pages";
import { usePage } from "@zilobase/features/pages/react";
import { defaultUserSettings } from "@zilobase/features/user-settings";
import { useUpdateUserSettings, useUserSettings } from "@zilobase/features/user-settings/react";
import { getDatabaseId, getMeetingId, getPageId } from "@/app/routing/route-identifiers";
import {
  isPublishedFallbackPage,
  readPublishedEmbeddedItemsOpenAs,
  writePublishedEmbeddedItemsOpenAs,
} from "../../access/lib/public-page-opening-preferences";
import { PageOpeningModeMenu } from "../../presentation/components/page-opening-mode-menu";

export function useRoutePageId(pathname: string) {
  const routePageId = getPageId(pathname);
  const meetingId = getMeetingId(pathname);
  const { data } = useMeeting(meetingId);
  return routePageId ?? data?.meeting.notesPageId ?? null;
}

export type PageHeaderProps = {
  actions?: ReactNode | null;
  className?: string;
  discussionsOpen?: boolean;
  leadingControl?: ReactNode | null;
  onClose?: () => void;
  onOpenFullPage?: () => void;
  onToggleDiscussions?: () => void;
  onTogglePageSidebar?: () => void;
  pageSidebarOpen?: boolean;
  pathname: string;
  pageId?: string | null;
  databaseId?: string | null;
  placement?: "main" | "pane" | "dialog";
  rowNavigationDatabaseId?: string | null;
  showActions?: boolean;
  showBreadcrumb?: boolean;
};

export const PageHeaderControlsContext = createContext<
  { pageId?: string | null } & Pick<
    PageHeaderProps,
    "discussionsOpen" | "onToggleDiscussions" | "onTogglePageSidebar" | "pageSidebarOpen"
  >
>({});

export function PageHeader({
  actions,
  className,
  discussionsOpen,
  leadingControl,
  onClose,
  onOpenFullPage,
  onToggleDiscussions,
  onTogglePageSidebar,
  pageSidebarOpen,
  pathname,
  pageId: explicitPageId,
  databaseId: explicitDatabaseId,
  placement = "main",
  rowNavigationDatabaseId,
  showActions = true,
  showBreadcrumb = true,
}: PageHeaderProps) {
  const routePageId = useRoutePageId(explicitPageId === undefined ? pathname : "");
  const pageId = explicitPageId === undefined ? routePageId : explicitPageId;
  const databaseId =
    explicitDatabaseId === undefined ? getDatabaseId(pathname) : explicitDatabaseId;
  const meetingId = explicitPageId === undefined ? getMeetingId(pathname) : null;
  const controls = useContext(PageHeaderControlsContext);
  const main = placement === "main" && (explicitPageId === undefined || controls.pageId === pageId);
  const leadingControls =
    placement !== "main" ? (
      <PagePaneControls
        leadingControl={leadingControl}
        onClose={onClose}
        onOpenFullPage={onOpenFullPage}
        placement={placement}
        pathname={pathname}
        pageId={pageId}
        rowNavigationDatabaseId={rowNavigationDatabaseId}
      />
    ) : (
      leadingControl
    );

  return (
    <header
      data-page-header
      className={`flex min-h-12 shrink-0 flex-wrap items-center gap-2 ${className ?? ""}`}
    >
      <div
        className={`flex h-7 flex-1 items-center gap-2 px-3 ${placement === "main" ? "min-w-0" : "min-w-fit"}`}
      >
        {leadingControls}
        {showBreadcrumb ? <AppBreadcrumbs pathname={pathname} /> : null}
      </div>
      {showActions ? (
        <div className="ml-auto flex h-7 shrink-0 items-center px-3">
          {actions ?? (
            <HeaderActions
              databaseId={databaseId}
              meetingId={meetingId}
              discussionsOpen={discussionsOpen ?? (main && controls.discussionsOpen)}
              onToggleDiscussions={
                onToggleDiscussions ?? (main ? controls.onToggleDiscussions : undefined)
              }
              onTogglePageSidebar={
                (main ? controls.onTogglePageSidebar : undefined) ?? onTogglePageSidebar
              }
              pageSidebarOpen={(main ? controls.pageSidebarOpen : undefined) ?? pageSidebarOpen}
              pageId={pageId}
            />
          )}
        </div>
      ) : null}
    </header>
  );
}

export function MainPaneHeaderLeadingControl() {
  return (
    <>
      <SidebarTrigger className="shrink-0" />
      <Separator orientation="vertical" className="self-center! data-[orientation=vertical]:h-4" />
    </>
  );
}

export function PageSidePaneCollapseButton({
  label = "Close",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <Button aria-label={label} onClick={onClick} size="icon" type="button" variant="ghost">
      <ChevronsRight />
    </Button>
  );
}

function useRowNavigationPageIds(databaseId: string | null) {
  const databaseBootstrap = useDatabaseBootstrap(databaseId ? { databaseId } : null);
  const view = databaseBootstrap.data?.views[0] ?? null;
  const records = useDatabaseRecords(
    databaseId && view
      ? {
          databaseId,
          dataSourceId: view.dataSourceId,
          viewId: view.id,
        }
      : null,
  );

  useEffect(() => {
    if (records.status !== "success" || !records.hasMore || records.isFetchingNextPage) {
      return;
    }
    void records.fetchNextPage();
  }, [
    records.fetchNextPage,
    records.hasMore,
    records.isFetchingNextPage,
    records.records.length,
    records.status,
  ]);

  return useMemo(
    () => records.records.filter((row) => !row.page.deletedAt).map((row) => row.pageId),
    [records.records],
  );
}

function PagePaneControls({
  leadingControl,
  onClose,
  onOpenFullPage,
  placement,
  pathname,
  pageId,
  rowNavigationDatabaseId,
}: {
  leadingControl?: ReactNode | null;
  onClose?: () => void;
  onOpenFullPage?: () => void;
  placement: "pane" | "dialog";
  pathname: string;
  pageId: string | null;
  rowNavigationDatabaseId?: string | null;
}) {
  const sidePane = useOptionalPageSidePane();
  const { data: page } = usePage(pageId, { refetchOnMount: false });
  const { data: userSettings = defaultUserSettings } = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const isPublishedFallback = isPublishedFallbackPage(page);
  const [publishedEmbeddedItemsOpenAs, setPublishedEmbeddedItemsOpenAs] =
    useState<EmbeddedItemsOpenAs>(readPublishedEmbeddedItemsOpenAs);
  const mode = isPublishedFallback
    ? publishedEmbeddedItemsOpenAs
    : resolveEmbeddedItemsOpenAs(userSettings.embeddedItemsOpenAs);
  const rowDatabaseId = pageId ? rowNavigationDatabaseId : null;
  const isDialogPane = placement === "dialog";
  const rowPageIds = useRowNavigationPageIds(rowDatabaseId ?? null);
  const { nextRowPageId, previousRowPageId } = useMemo(() => {
    const currentRowIndex = pageId ? rowPageIds.indexOf(pageId) : -1;

    return {
      previousRowPageId: currentRowIndex > 0 ? rowPageIds[currentRowIndex - 1] : null,
      nextRowPageId:
        currentRowIndex >= 0 && currentRowIndex < rowPageIds.length - 1
          ? rowPageIds[currentRowIndex + 1]
          : null,
    };
  }, [pageId, rowPageIds]);

  const handleModeSelect = (nextMode: EmbeddedItemsOpenAs) => {
    if (!pageId) {
      return;
    }

    if (isPublishedFallback) {
      writePublishedEmbeddedItemsOpenAs(nextMode);
      setPublishedEmbeddedItemsOpenAs(nextMode);
    } else {
      updateUserSettings.mutate(
        { embeddedItemsOpenAs: nextMode },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error ? error.message : "Could not update open pages setting.",
            );
          },
        },
      );
    }

    if (nextMode === "dialog" && !isDialogPane) {
      sidePane?.openEmbeddedPageDialog(pageId, { databaseId: rowDatabaseId });
    } else if (nextMode === "sidepanel" && isDialogPane) {
      sidePane?.openSidePane(pageId, { databaseId: rowDatabaseId });
    }
  };

  const openRowPage = (targetPageId: string | null) => {
    if (!targetPageId || !rowDatabaseId) {
      return;
    }

    if (isDialogPane) {
      sidePane?.openEmbeddedPageDialog(targetPageId, {
        databaseId: rowDatabaseId,
      });
    } else {
      sidePane?.openSidePane(targetPageId, { databaseId: rowDatabaseId });
    }
  };

  return (
    <ButtonGroup
      aria-label="Page presentation actions"
      className="shrink-0 items-center"
      variant="plain"
    >
      {onClose ? (
        isDialogPane ? (
          <Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
            <XIcon />
          </Button>
        ) : (
          <PageSidePaneCollapseButton onClick={onClose} />
        )
      ) : (
        leadingControl
      )}
      <Button aria-label="Open as full page" asChild size="icon" variant="ghost">
        <Link
          to={pathname}
          onClick={(event) => {
            if (
              !onOpenFullPage ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            )
              return;
            event.preventDefault();
            onOpenFullPage();
          }}
        >
          <Maximize2 />
        </Link>
      </Button>
      {pageId ? (
        <PageOpeningModeMenu
          disabled={!isPublishedFallback && updateUserSettings.isPending}
          itemLabel="pages"
          mode={mode}
          onSelect={handleModeSelect}
        />
      ) : null}
      {rowDatabaseId ? (
        <div className="contents">
          <Separator
            orientation="vertical"
            className="mx-1 self-center! data-[orientation=vertical]:h-4"
          />
          <Button
            aria-label="Open previous row"
            disabled={!previousRowPageId}
            onClick={() => openRowPage(previousRowPageId)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronUp />
          </Button>
          <Button
            aria-label="Open next row"
            disabled={!nextRowPageId}
            onClick={() => openRowPage(nextRowPageId)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronDown />
          </Button>
        </div>
      ) : null}
    </ButtonGroup>
  );
}
