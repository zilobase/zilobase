import { PageLayout } from "@/sections/pages/layout/components/page-layout";
import {
  buildHomepageViewData,
  buildHomepageRows,
  isHomepageView,
  libraryParentPropertyId,
  homepageViews as libraryViews,
  type RecentsMode,
  type HomepageView,
} from "./lib/library-model";
import { CreateTeamspaceDialog as CreateLibraryTeamspaceDialog } from "@/sections/teamspaces/components/create-teamspace-dialog";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Database, FileText, Loader2, Plus } from "@/components/icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/ui/button-group";
import { useCreateLibraryItem } from "@zilobase/features/library/react";
import {
  applyLibraryItemOrder,
  moveLibraryItem,
  canCreateLibraryChild,
} from "@zilobase/features/library";
import { setDatabasePageDragPayload } from "@/sections/databases/interactions/lib/database-page-drop";
import { type TableRowInteractions } from "@/sections/databases/views/table/components/database-table-view";

import { libraryViewIcons } from "@/components/navigation/lib/library-views";

import { PageSidePaneLayout } from "@/sections/pages/presentation/components/page-side-pane";
import { usePageSidePane } from "@/sections/pages/presentation/components/page-presentation";
import { useOpenEmbeddedPage } from "@/sections/pages/navigation/hooks/page-navigation";
import { PageContent } from "@/sections/pages/editor/page-content";
import { DatabaseTableView } from "@/sections/databases/views/table/components/database-table-view";
import { DatabaseViewProvider } from "@/sections/databases/views/state/components/database-view-context";
import { DatabaseViewSkeleton } from "@/sections/databases/views/shared/components/database-view-skeleton";
import { DatabaseViewToolbar } from "@/sections/databases/views/shared/components/database-view-toolbar";
import { getDatabaseViewModel } from "@/sections/databases/views/shared/components/database-view-model";
import {
  getMergedDatabaseConfig,
  getMergedNameColumnConfig,
  getMergedPropertyConfig,
  type DatabaseNameColumnConfig,
  type DatabasePropertyConfig,
  type DatabaseSortConfig,
} from "@zilobase/features/databases";
import { DatabaseMainPane } from "@/sections/databases/database-screen";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useCreateDatabase } from "@zilobase/features/databases/react";

import { useWorkspaceMeetings } from "@zilobase/features/meetings/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";

import { useCreatePage, usePageNavigation } from "@zilobase/features/pages/react";

import { defaultUserSettings, normalizeSidebarConfig } from "@zilobase/features/user-settings";
import { useUpdateUserSettings, useUserSettings } from "@zilobase/features/user-settings/react";

import { useTeamspaces } from "@zilobase/features/teamspaces/react";

const homepageViews = libraryViews.map((view) => ({ ...view, icon: libraryViewIcons[view.id] }));

const emptyAsync = async () => undefined;

export default function RecentsScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const workspaceId = useActiveWorkspaceId();
  const { data: userSettings = defaultUserSettings, isLoading: settingsLoading } =
    useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const sidebarConfig = useMemo(
    () => normalizeSidebarConfig(userSettings.sidebarConfig),
    [userSettings.sidebarConfig],
  );
  const requestedView = isHomepageView(location.search.view) ? location.search.view : null;
  const [activeViewId, setActiveViewId] = useState<HomepageView | null>(
    () => requestedView ?? sidebarConfig.libraryView,
  );
  const mode: RecentsMode = activeViewId === "trash" ? "trash" : "home";
  const { data: navigation, isLoading } = usePageNavigation(workspaceId, {
    deleted: mode === "trash" ? "only" : "active",
  });
  const { data: meetingsPayload, isLoading: meetingsLoading } = useWorkspaceMeetings(
    mode === "home" ? workspaceId : null,
  );
  const { data: teamspaces = [], isLoading: teamspacesLoading } = useTeamspaces(
    mode === "home" ? workspaceId : null,
  );
  const {
    closeSidePane,
    openSidePaneAsFullPage,
    openDatabaseSidePane,
    renderedSidePaneDatabaseId,
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane();
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: null,
    databaseId: null,
    page: null,
  });
  const createPageMutation = useCreatePage();
  const createLibraryItem = useCreateLibraryItem();
  const createDatabase = useCreateDatabase();
  const [createTeamspaceOpen, setCreateTeamspaceOpen] = useState(false);
  const [databaseConfig, setDatabaseConfig] = useState<unknown>({
    nameColumn: {
      label: "Page name",
      showPageIcon: true,
    },
  });
  const [propertyConfigs, setPropertyConfigs] = useState<Record<string, unknown>>({});
  const [viewConfigs, setViewConfigs] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      homepageViews.map((view) => [
        view.id,
        {
          subItems: {
            display: "nested",
            enabled: true,
            filter: "parents-only",
            parentPropertyId: libraryParentPropertyId,
            property: "parent-item",
          },
        },
      ]),
    ),
  );
  const rows = useMemo(() => {
    return applyLibraryItemOrder(
      buildHomepageRows(
        navigation ?? { databases: [], pages: [], placements: [] },
        meetingsPayload?.meetings ?? [],
        mode,
        teamspaces,
      ),
      workspaceId && activeViewId
        ? sidebarConfig.libraryOrders?.[workspaceId]?.[activeViewId]
        : undefined,
    );
  }, [
    meetingsPayload?.meetings,
    navigation,
    mode,
    teamspaces,
    sidebarConfig.libraryOrders,
    workspaceId,
    activeViewId,
  ]);
  const pageTitle = "Library";

  useEffect(() => {
    if (location.pathname !== "/recents") return;

    const nextView = requestedView ?? sidebarConfig.libraryView;
    setActiveViewId((current) => (current === nextView ? current : nextView));

    if (!requestedView && !settingsLoading) {
      void navigate({
        replace: true,
        search: { view: nextView },
        to: "/recents",
      });
    }
  }, [location.pathname, navigate, requestedView, settingsLoading, sidebarConfig.libraryView]);

  const selectRecentsView = (viewId: string | null) => {
    if (!viewId || !isHomepageView(viewId)) return;

    setActiveViewId(viewId);

    void navigate({
      replace: true,
      search: { view: viewId },
      to: "/recents",
    });
    if (sidebarConfig.libraryView !== viewId) {
      updateUserSettings.mutate({
        sidebarConfig: { ...sidebarConfig, libraryView: viewId },
      });
    }
  };
  const viewData = useMemo(
    () =>
      buildHomepageViewData({
        activeViewId: activeViewId ?? "recents",
        databaseConfig,
        mode,
        workspaceId,
        propertyConfigs,
        rows,
        viewConfigs: {
          ...viewConfigs,
          recents: {
            ...(!workspaceId || !sidebarConfig.libraryOrders?.[workspaceId]?.recents
              ? { sorts: [{ column: "lastVisitedAt", direction: "descending" }] }
              : {}),
            ...(viewConfigs.recents as Record<string, unknown>),
          },
        },
      }),
    [
      activeViewId,
      databaseConfig,
      mode,
      workspaceId,
      propertyConfigs,
      rows,
      viewConfigs,
      sidebarConfig.libraryOrders,
    ],
  );
  const viewModel = useMemo(
    () =>
      getDatabaseViewModel({
        activeViewId,
        viewData,
      }),
    [activeViewId, viewData],
  );
  const activeView = viewModel.activeView;
  const updateActiveViewConfig = (nextConfig: unknown) => {
    if (!activeViewId) {
      return;
    }

    setViewConfigs((current) => ({
      ...current,
      [activeViewId]: nextConfig,
    }));
  };
  const saveDatabaseSorts = async (sorts: DatabaseSortConfig[]) => {
    updateActiveViewConfig(
      getMergedDatabaseConfig(activeView?.config, {
        sorts,
      }),
    );
  };
  const setViewGroupProperty = (groupPropertyId: string | null) => {
    updateActiveViewConfig(
      getMergedDatabaseConfig(activeView?.config, {
        groupPropertyId: groupPropertyId ?? undefined,
      }),
    );
  };
  const updateDatabasePropertyConfig = async (databasePropertyId: string, config: unknown) => {
    setPropertyConfigs((current) => ({
      ...current,
      [databasePropertyId]: getMergedPropertyConfig(
        current[databasePropertyId],
        config as DatabasePropertyConfig,
      ),
    }));
  };
  const updateNameColumnConfig = (config: unknown) => {
    setDatabaseConfig((current: unknown) =>
      getMergedNameColumnConfig(current, config as DatabaseNameColumnConfig),
    );
  };
  const isCreating = createPageMutation.isPending || createDatabase.isPending;

  const createPage = async () => {
    if (!workspaceId || createPageMutation.isPending) {
      return;
    }

    try {
      const page = await createPageMutation.mutateAsync({ workspaceId });

      await navigate({
        params: { pageId: page.id },
        to: "/p/$pageId",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create page.");
    }
  };

  const createStandaloneDatabase = async () => {
    if (!workspaceId || createDatabase.isPending) {
      return;
    }

    try {
      const payload = await createDatabase.mutateAsync({
        workspaceId,
        standalone: true,
      });

      await navigate({
        params: { databaseId: payload.database.id },
        search: { view: undefined },
        to: "/d/$databaseId",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create database.");
    }
  };

  const openHomepagePage = (pageId: string) => {
    const row = rows.find(
      (candidate) => candidate.id === pageId || candidate.openPageId === pageId,
    );

    if (row) {
      if (row.itemKind === "teamspace" && row.teamspaceId) {
        void navigate({
          search: { teamspace: row.teamspaceId, tab: "general" },
          to: "/settings/teamspaces",
        });
        return;
      }
      if (row.openDatabaseId) {
        openDatabaseSidePane(row.openDatabaseId);
        return;
      }

      if (row.openMeetingId) {
        void navigate({
          params: { meetingId: row.openMeetingId },
          to: "/m/$meetingId",
        });
        return;
      }

      if (row.openPageId) {
        openPage(row.openPageId);
      }
      return;
    }

    openPage(pageId);
  };
  const libraryRowInteractions: TableRowInteractions = {
    newRowLabel: activeViewId === "teamspaces" ? "New teamspace" : "New page",
    canCreateRow: (parentRowId) =>
      mode === "home" &&
      Boolean(workspaceId) &&
      !createLibraryItem.isPending &&
      (!parentRowId || rows.some((row) => row.id === parentRowId && canCreateLibraryChild(row))),
    createRow: (parentRowId) => {
      if (!workspaceId || createLibraryItem.isPending || mode !== "home") return;
      if (!parentRowId && activeViewId === "teamspaces") {
        setCreateTeamspaceOpen(true);
        return;
      }
      const parent = parentRowId ? rows.find((row) => row.id === parentRowId) : undefined;
      if (parentRowId && !parent) return;
      createLibraryItem.mutate(
        { workspaceId, parent, favorite: activeViewId === "favourites" },
        {
          onError: (error) =>
            toast.error(error instanceof Error ? error.message : "Could not create page."),
        },
      );
    },
    canDragRow: () => mode === "home" && !updateUserSettings.isPending,
    dragRow: (item, event) => {
      const row = rows.find((row) => row.id === item.id);
      if (!row) return;
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(
        "application/x-zilobase-library-item",
        JSON.stringify({ id: row.id, title: row.name }),
      );
      if (row.openPageId) {
        setDatabasePageDragPayload(event.dataTransfer, {
          pageId: row.openPageId,
          title: row.name,
        });
      }
    },
    moveRow: async (move) => {
      if (!workspaceId || !activeViewId || updateUserSettings.isPending || mode !== "home") return;
      const order = moveLibraryItem(
        [...new Set([...viewModel.sortedItems.map((row) => row.id), ...rows.map((row) => row.id)])],
        move,
      );
      await updateUserSettings.mutateAsync({
        sidebarConfig: {
          ...sidebarConfig,
          libraryOrders: {
            ...sidebarConfig.libraryOrders,
            [workspaceId]: { ...sidebarConfig.libraryOrders?.[workspaceId], [activeViewId]: order },
          },
        },
      });
      updateActiveViewConfig(getMergedDatabaseConfig(activeView?.config, { sorts: [] }));
    },
    renderSelectionToolbar: (selectedRows, clearSelection) => (
      <div className="database-selection-toolbar-layer">
        <ButtonGroup
          aria-label="Selected Library items"
          className="database-selection-toolbar"
          role="toolbar"
          variant="segmented"
        >
          <ButtonGroupItem
            aria-label={`Clear selection of ${selectedRows.length} items`}
            onClick={clearSelection}
            tone="accent"
            type="button"
          >
            {selectedRows.length} selected
          </ButtonGroupItem>
        </ButtonGroup>
      </div>
    ),
  };

  const openSidePaneChildPage = (pageId: string) => {
    openPage(pageId, { databaseId: sidePaneDatabaseId });
  };

  return (
    <>
      <PageSidePaneLayout
        main={
          <main className="min-h-0 flex-1 bg-surface-canvas">
            <section className="animate-in fade-in-0 duration-300">
              <div className="tiptap-editor px-5 pb-10 pt-8 sm:px-8 md:px-20 lg:px-24">
                <DatabaseViewProvider
                  value={{
                    ...viewModel,
                    activeViewTabId: activeViewId,
                    addDatabaseProperty: () => {},
                    addDatabaseRow: () => {},
                    addChartView: () => {},
                    addFormView: () => {},
                    addGalleryView: () => {},
                    addDraggedPageRow: () => {},
                    addKanbanView: () => {},
                    addListView: () => {},
                    linkDataSourceView: () => {},
                    addTableView: () => {},
                    addTimelineRow: () => {},
                    addTimelineView: () => {},
                    addCalendarView: () => {},
                    addCalendarRow: async () => {
                      throw new Error("Recents cannot create calendar records");
                    },
                    setCalendarMode: () => {},
                    canAddDatabaseProperties: false,
                    canAddDatabaseRows: false,
                    canAddDatabaseViews: false,
                    clearDatabaseFilter: () => updateActiveViewConfig(undefined),
                    clearDatabaseSort: () => void saveDatabaseSorts([]),
                    copyDatabaseViewLink: () => {},
                    createDatabaseFilter: () => {},
                    createDatabaseSort: () => {},
                    databaseConfig: viewData.bootstrap.database.config,
                    databaseId: viewData.bootstrap.database.id,
                    databaseName: viewData.bootstrap.database.name,
                    databaseWorkspaceId: workspaceId ?? undefined,
                    realtimeEnabled: false,
                    deleteDatabaseView: () => {},
                    draftDatabaseTitle: pageTitle,
                    draftViewTitle:
                      homepageViews.find((view) => view.id === activeViewId)?.label ?? "Recents",
                    duplicateDatabaseView: () => {},
                    editable: false,
                    fetchNextPage: emptyAsync,
                    filterPickerOpen: false,
                    getDatabasePageDragPayload: () => null,
                    hasDatabasePageDragPayload: () => false,
                    hasNextPage: false,
                    headerMenusEnabled: true,
                    hostDatabaseId: viewData.bootstrap.database.id,
                    hostDatabaseName: viewData.bootstrap.database.name,
                    hostDatabaseWorkspaceId: workspaceId ?? undefined,
                    hostViews: viewData.bootstrap.views,
                    isAddingDatabaseProperty: false,
                    isAddingDatabaseRow: false,
                    isAddingDatabaseView: false,
                    isFetchingNextPage: false,
                    onOpenPage: openHomepagePage,
                    onShowTitleChange: undefined,
                    options: viewModel.kanbanOptions,
                    prefetchDatabaseView: () => {},
                    workspaceId,
                    removeDatabaseFilter: () => {},
                    removeDatabaseSort: () => {},
                    renameDatabaseProperty: () => {},
                    reorderDatabaseFilters: () => {},
                    saveDatabaseConditionalColors: () => {},
                    saveDatabaseEmoji: () => {},
                    saveDatabaseFilters: () => {},
                    saveDatabasePropertyOrder: () => {},
                    saveDatabaseSorts,
                    saveDatabaseTitle: () => {},
                    saveDatabaseViewIcon: () => {},
                    saveDatabaseViewTitle: () => {},
                    savePropertyValue: () => {},
                    setActiveViewId: (nextView) =>
                      selectRecentsView(
                        typeof nextView === "function" ? nextView(activeViewId) : nextView,
                      ),
                    setDraftDatabaseTitle: () => {},
                    setDraftViewTitle: () => {},
                    setFilterPickerOpen: () => {},
                    setSortPickerOpen: () => {},
                    setViewDateProperty: () => {},
                    setupTimelineDateProperty: () => {},
                    setViewGroupProperty,
                    setViewType: () => {},
                    showExpandButton: false,
                    showFilterPill: false,
                    showSortPill: false,
                    showTitle: false,
                    sortPickerOpen: false,
                    toggleFilterPillVisibility: () => {},
                    togglePropertyVisibility: (propertyId) => {
                      void updateDatabasePropertyConfig(propertyId, {
                        hidden: true,
                      });
                    },
                    togglePropertyTitles: () => {},
                    toggleSortPillVisibility: () => {},
                    updateDatabaseFilter: () => {},
                    updateDatabaseChartSettings: () => {},
                    updateDatabaseLayoutSettings: () => {},
                    updateDatabasePropertyConfig,
                    updateDatabaseSort: () => {},
                    updateDatabaseSubItemsSettings: (settings) =>
                      updateActiveViewConfig(
                        getMergedDatabaseConfig(activeView?.config, {
                          subItems: {
                            ...viewModel.subItemsSettings,
                            ...settings,
                          },
                        }),
                      ),
                    updateNameColumnConfig,
                    viewTabs: homepageViews.map((view) => ({
                      dataSourceId: viewData.activeDataSource!.id,
                      fallbackIcon: view.icon,
                      id: view.id,
                      name: view.label,
                      sourceParentDatabaseId: viewData.bootstrap.database.id,
                      type: "table",
                    })),
                    views: viewData.bootstrap.views,
                  }}
                >
                  <div className="database-block-shell database-block-shell-full">
                    <div className="database-toolbar-section">
                      <h1 className="min-h-10 py-0 text-4xl font-semibold leading-tight tracking-normal text-content-primary">
                        {pageTitle}
                      </h1>
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <DatabaseViewToolbar />
                        </div>
                        {mode === "home" && activeViewId === "teamspaces" ? (
                          <Button
                            className="mt-2 shrink-0"
                            disabled={!workspaceId}
                            onClick={() => setCreateTeamspaceOpen(true)}
                            type="button"
                          >
                            <Plus /> New teamspace
                          </Button>
                        ) : mode === "home" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                className="database-new-button mt-2 shrink-0"
                                disabled={!workspaceId || isCreating}
                                trailingDivider
                                type="button"
                              >
                                {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
                                <span>New</span>
                                <ChevronDown className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onSelect={() => void createStandaloneDatabase()}>
                                <Database />
                                <span>Database</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => void createPage()}>
                                <FileText />
                                <span>Page</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </div>
                    <div className="database-scroll-section">
                      {isLoading ||
                      (activeViewId === "meetings" && meetingsLoading) ||
                      (activeViewId === "teamspaces" && teamspacesLoading) ? (
                        <DatabaseViewSkeleton viewType="table" />
                      ) : (
                        <DatabaseTableView rowInteractions={libraryRowInteractions} />
                      )}
                    </div>
                  </div>
                </DatabaseViewProvider>
              </div>
            </section>
          </main>
        }
        sidePane={
          sidePaneContentReady && (renderedSidePanePageId || renderedSidePaneDatabaseId) ? (
            renderedSidePaneDatabaseId ? (
              <PageLayout
                pageId={null}
                databaseId={renderedSidePaneDatabaseId}
                placement="pane"
                onClose={closeSidePane}
                onOpenFullPage={openSidePaneAsFullPage}
              >
                <DatabaseMainPane
                  className="min-h-0 flex-1"
                  databaseId={renderedSidePaneDatabaseId}
                  embedded
                  key={renderedSidePaneDatabaseId}
                  onOpenPage={openSidePaneChildPage}
                />
              </PageLayout>
            ) : renderedSidePanePageId ? (
              <PageLayout
                pageId={renderedSidePanePageId}
                placement="pane"
                rowNavigationDatabaseId={sidePaneDatabaseId}
                onClose={closeSidePane}
                onOpenFullPage={openSidePaneAsFullPage}
              >
                <PageContent
                  databaseId={sidePaneDatabaseId}
                  enableComments={false}
                  key={renderedSidePanePageId}
                  onOpenPage={openSidePaneChildPage}
                  pageId={renderedSidePanePageId}
                />
              </PageLayout>
            ) : null
          ) : null
        }
        sidePaneOpen={sidePaneAnimatedOpen}
        sidePaneVisible={Boolean(renderedSidePanePageId || renderedSidePaneDatabaseId)}
      />
      <CreateLibraryTeamspaceDialog
        idPrefix="library-teamspace"
        onOpenChange={setCreateTeamspaceOpen}
        open={createTeamspaceOpen}
        workspaceId={workspaceId}
      />
    </>
  );
}
