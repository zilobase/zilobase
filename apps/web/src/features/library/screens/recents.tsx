import { buildHomepageViewData, buildHomepageRows, isHomepageView, homepageViews as libraryViews, type RecentsMode } from "../model/library-model";
import { TeamspacesLibraryTable } from "../components/teamspace-library-table";
import { CreateTeamspaceDialog as CreateLibraryTeamspaceDialog } from "@/features/teamspaces/creation/index";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { BotIcon, ChevronDown, Database, FileText, Loader2, Plus } from "@/shared/components/icons";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";

import { libraryViewIcons } from "@/features/sidebar";

import {
  PageSidePaneLayout,
  usePageSidePane,
} from "@/features/pages/pane/page-side-pane";
import {
  useOpenEmbeddedPage,
} from "@/features/pages/pane/use-open-embedded-page";
import { PageEditorPane } from "@/features/pages/pane/page-editor-pane";
import { DatabaseTableView, DatabaseViewProvider, DatabaseViewSkeleton, DatabaseViewToolbar, getDatabaseViewModel, getMergedDatabaseConfig, getMergedNameColumnConfig, getMergedPropertyConfig, type DatabaseNameColumnConfig, type DatabasePropertyConfig, type DatabaseSortConfig } from "@/features/databases";
import { DatabaseMainPane } from "@/features/databases/core/index";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

import { useCreateDatabase } from "@zilobase/features/databases/react";

import { useWorkspaceMeetings } from "@zilobase/features/meetings/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";

import { useCreatePage, usePageNavigation } from "@zilobase/features/pages/react";

import { defaultUserSettings, normalizeSidebarConfig } from "@zilobase/features/user-settings";
import { useUpdateUserSettings, useUserSettings } from "@zilobase/features/user-settings/react";
import { useConnectivity, useOfflineManifest } from "@/features/offline/index";

import { useTeamspaces } from "@zilobase/features/teamspaces/react";
import { useAiAgentProfiles, useCreateAiAgentProfile } from "@zilobase/features/ai-chat/react";

const homepageViews = libraryViews.map(view => ({ ...view, icon: libraryViewIcons[view.id] }));

const emptyAsync = async () => undefined;

export default function RecentsPage({
  mode = "home",
}: {
  mode?: RecentsMode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const workspaceId = useActiveWorkspaceId();
  const connectivity = useConnectivity();
  const offlineManifest = useOfflineManifest();
  const offlineMode =
    connectivity === "offline" || connectivity === "service-unavailable";
  const downloadedItems = offlineManifest.items.filter(
    (item) => item.workspaceId === workspaceId,
  );
  const { data: userSettings = defaultUserSettings, isLoading: settingsLoading } =
    useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const sidebarConfig = useMemo(
    () => normalizeSidebarConfig(userSettings.sidebarConfig),
    [userSettings.sidebarConfig],
  );
  const requestedView =
    mode === "home" && isHomepageView(location.search.view)
      ? location.search.view
      : null;
  const { data: navigation, isLoading } = usePageNavigation(workspaceId, {
    deleted: mode === "trash" ? "only" : "active",
  });
  const { data: meetingsPayload, isLoading: meetingsLoading } =
    useWorkspaceMeetings(mode === "home" ? workspaceId : null);
  const { data: teamspaces = [], isLoading: teamspacesLoading } =
    useTeamspaces(mode === "home" ? workspaceId : null);
  const { data: customAgents = [] } = useAiAgentProfiles({ enabled: mode === "home" });
  const {
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
  const createDatabase = useCreateDatabase();
  const [activeViewId, setActiveViewId] = useState<string | null>("recents");
  const [createTeamspaceOpen, setCreateTeamspaceOpen] = useState(false);
  const [databaseConfig, setDatabaseConfig] = useState<unknown>({
    nameColumn: {
      label: "Page name",
      showPageIcon: true,
    },
  });
  const [propertyConfigs, setPropertyConfigs] = useState<
    Record<string, unknown>
  >({});
  const [viewConfigs, setViewConfigs] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      homepageViews.map((view) => [
        view.id,
        {
          ...(view.id === "recents"
            ? {
                sorts: [
                  { column: "lastVisitedAt", direction: "descending" },
                ],
              }
            : {}),
          subItems: {
            display: "nested",
            enabled: true,
            filter: "parents-only",
            property: "sub-item",
          },
        },
      ]),
    ),
  );
  const rows = useMemo(
    () => {
      const builtRows = buildHomepageRows(
        navigation ?? { databases: [], pages: [], placements: [] },
        meetingsPayload?.meetings ?? [],
        customAgents,
        mode,
      );
      if (!offlineMode) return builtRows;
      const pageIds = new Set(
        downloadedItems
          .filter((item) => item.kind === "page")
          .map((item) => item.id),
      );
      const databaseIds = new Set(
        downloadedItems
          .filter((item) => item.kind === "database")
          .map((item) => item.id),
      );
      return builtRows.filter(
        (row) =>
          (row.openPageId && pageIds.has(row.openPageId)) ||
          (row.openDatabaseId && databaseIds.has(row.openDatabaseId)),
      );
    },
    [customAgents, downloadedItems, meetingsPayload?.meetings, navigation, mode, offlineMode],
  );
  const pageTitle = mode === "trash" ? "Trash" : "Library";

  useEffect(() => {
    if (mode !== "home" || location.pathname !== "/recents") return;

    const nextView = requestedView ?? sidebarConfig.libraryView;
    setActiveViewId((current) => (current === nextView ? current : nextView));

    if (!requestedView && !settingsLoading) {
      void navigate({
        replace: true,
        search: { view: nextView },
        to: "/recents",
      });
    }
  }, [
    mode,
    location.pathname,
    navigate,
    requestedView,
    settingsLoading,
    sidebarConfig.libraryView,
  ]);

  const selectRecentsView = (viewId: string | null) => {
    if (!viewId || !isHomepageView(viewId)) return;

    setActiveViewId(viewId);
    if (mode !== "home") return;

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
        viewConfigs,
      }),
    [
      activeViewId,
      databaseConfig,
      mode,
      workspaceId,
      propertyConfigs,
      rows,
      viewConfigs,
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
  const updateDatabasePropertyConfig = async (
    databasePropertyId: string,
    config: unknown,
  ) => {
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
  const createAgent = useCreateAiAgentProfile();
  const isCreating = createPageMutation.isPending || createDatabase.isPending || createAgent.isPending;

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
      toast.error(
        error instanceof Error ? error.message : "Could not create page.",
      );
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
      toast.error(
        error instanceof Error ? error.message : "Could not create database.",
      );
    }
  };

  const createCustomAgent = async () => {
    try {
      const payload = await createAgent.mutateAsync({ name: "Untitled agent" });
      await navigate({ params: { agentId: payload.agent.id }, to: "/agents/$agentId" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create agent.");
    }
  };

  const openHomepagePage = (pageId: string) => {
    const row = rows.find(
      (candidate) => candidate.id === pageId || candidate.openPageId === pageId,
    );

    if (row) {
      if (row.openAgentId) {
        void navigate({ params: { agentId: row.openAgentId }, to: "/agents/$agentId" });
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
  const openSidePaneChildPage = (pageId: string) => {
    openPage(pageId, { databaseId: sidePaneDatabaseId });
  };

  if (offlineMode && downloadedItems.length === 0) {
    return (
      <main className="flex min-h-[calc(100svh-3rem)] flex-1 items-center justify-center px-6">
        <div className="max-w-md space-y-2 text-center">
          <h1 className="font-heading text-xl font-medium">No offline items yet</h1>
          <p className="text-sm text-content-secondary">
            Reconnect, then use a page or database menu to make it available offline.
          </p>
        </div>
      </main>
    );
  }

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
                    homepageViews.find((view) => view.id === activeViewId)
                      ?.label ?? "Recents",
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
                      typeof nextView === "function"
                        ? nextView(activeViewId)
                        : nextView,
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
                          disabled={offlineMode || !workspaceId}
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
                              disabled={offlineMode || !workspaceId || isCreating}
                              title={offlineMode ? "Creating items requires a connection." : undefined}
                              trailingDivider
                              type="button"
                            >
                              {isCreating ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Plus />
                              )}
                              <span>New</span>
                              <ChevronDown className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onSelect={() => void createCustomAgent()}>
                              <BotIcon />
                              <span>Agent</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => void createStandaloneDatabase()}
                            >
                              <Database />
                              <span>Database</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => void createPage()}
                            >
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
                    ) : activeViewId === "teamspaces" ? (
                      <TeamspacesLibraryTable
                        onOpenRow={openHomepagePage}
                        rows={rows}
                        teamspaces={teamspaces}
                      />
                    ) : (
                      <DatabaseTableView />
                    )}
                  </div>
                </div>
              </DatabaseViewProvider>
            </div>
          </section>
        </main>
      }
      sidePane={
        sidePaneContentReady &&
        (renderedSidePanePageId || renderedSidePaneDatabaseId) ? (
          renderedSidePaneDatabaseId ? (
            <DatabaseMainPane
              className="min-h-0 flex-1 overflow-y-auto"
              databaseId={renderedSidePaneDatabaseId}
              embedded
              key={renderedSidePaneDatabaseId}
              onOpenPage={openSidePaneChildPage}
            />
          ) : renderedSidePanePageId ? (
            <PageEditorPane
              databaseId={sidePaneDatabaseId}
              enableComments={false}
              key={renderedSidePanePageId}
              onOpenPage={openSidePaneChildPage}
              pageId={renderedSidePanePageId}
            />
          ) : null
        ) : null
      }
      sidePaneOpen={sidePaneAnimatedOpen}
      sidePaneVisible={Boolean(
        renderedSidePanePageId || renderedSidePaneDatabaseId,
      )}
    />
    <CreateLibraryTeamspaceDialog idPrefix="library-teamspace"
      onOpenChange={setCreateTeamspaceOpen}
      open={createTeamspaceOpen}
      workspaceId={workspaceId}
    />
    </>
  );
}
