import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Database, FileText, Globe2Icon, Layers3Icon, Loader2, LockIcon, Plus, UsersIcon } from "@/components/icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { libraryViewIcons } from "@/components/sidebar-layout-icons";
import { libraryViewLabels } from "@/components/sidebar-layout-model";
import { PageSidePaneLayout, usePageSidePane } from "@/contexts/page-side-pane";
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page";
import { PageEditorPane } from "@/pages/page";
import { DatabaseMainPane } from "@/pages/database";
import { buildHomepageHierarchy } from "@/pages/homepage-hierarchy";
import { DEFAULT_MEETING_ITEM_ICON } from "@/lib/item-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DatabaseTableView } from "@/packages/editor/extensions/database/views/table/database-table-view";
import { DatabaseViewProvider } from "@/packages/editor/extensions/database/views/database-view-context";
import { DatabaseViewToolbar } from "@/packages/editor/extensions/database/views/database-view-toolbar";
import { DatabaseViewSkeleton } from "@/packages/editor/extensions/database/views/database-view-skeleton";
import { DatabasePageLink } from "@/packages/editor/extensions/database/interactions/database-page-link";
import { getDatabaseViewModel } from "@/packages/editor/extensions/database/views/database-view-model";
import {
  getMergedDatabaseConfig,
  getMergedNameColumnConfig,
  getMergedPropertyConfig,
  type DatabaseNameColumnConfig,
  type DatabasePropertyConfig,
  type DatabaseSortConfig,
} from "@/packages/editor/extensions/database/views/database-view-config";
import {
  getDatabaseEmoji,
  useCreateDatabase,
} from "@zilobase/features/databases";
import {
  useWorkspaceMeetings,
  type MeetingListItem,
} from "@zilobase/features/meetings";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces";
import {
  useCreatePage,
  usePageNavigation,
  type Page,
  type PageDatabase,
  type PageItemPlacement,
  type PageNavigationPayload,
} from "@zilobase/features/pages";
import type {
  DatabasePayload,
  DatabaseProperty,
  DatabaseView,
  PagePropertyValue,
} from "@zilobase/features/databases";
import {
  defaultUserSettings,
  libraryViewIds,
  normalizeSidebarConfig,
  useUpdateUserSettings,
  useUserSettings,
  type LibraryView,
} from "@zilobase/features/user-settings";
import { useConnectivity, useOfflineManifest } from "@/providers/offline-provider";
import { PageIconDisplay } from "@/lib/page-icon";
import { getApiErrorMessage } from "@/lib/api";
import { useCreateTeamspace, useTeamspaces, type Teamspace, type TeamspaceAccessMode } from "@zilobase/features/teamspaces";

type HomepageView = LibraryView;

type RecentsMode = "home" | "trash";

type HomepageRow = {
  createdAt: string;
  createdBy: string;
  deletedAt: string;
  deletedBy: string;
  iconKind: "database" | "page";
  id: string;
  isFavorite: boolean;
  isShared: boolean;
  itemKind: "database" | "meeting" | "page";
  teamspaceId: string | null;
  lastVisitedAt: string | null;
  metadata: Page["metadata"] | null;
  name: string;
  openDatabaseId: string | null;
  openMeetingId: string | null;
  openPageId: string | null;
  parentRowId: string | null;
  position: number;
  source: string;
  sourcePage: HomepageSourcePage | null;
  updatedAt: string;
};

type HomepageSourcePage = {
  iconKind: "database" | "page";
  id: string;
  metadata: Page["metadata"] | null;
  name: string;
};

const homepageViews: Array<{
  icon: (typeof libraryViewIcons)[HomepageView];
  id: HomepageView;
  label: string;
}> = [
  { icon: libraryViewIcons.recents, id: "recents", label: libraryViewLabels.recents },
  { icon: libraryViewIcons.favourites, id: "favourites", label: libraryViewLabels.favourites },
  { icon: libraryViewIcons.meetings, id: "meetings", label: libraryViewLabels.meetings },
  { icon: libraryViewIcons.shared, id: "shared", label: libraryViewLabels.shared },
  { icon: libraryViewIcons.teamspaces, id: "teamspaces", label: libraryViewLabels.teamspaces },
  { icon: libraryViewIcons.private, id: "private", label: libraryViewLabels.private },
];

const homepagePropertyDefinitions = [
  { id: "source", name: "Source", type: "relation", width: 220 },
  { id: "createdBy", name: "Created by", type: "text", width: 190 },
  { id: "lastVisitedAt", name: "Last visited time", type: "date", width: 210 },
  { id: "updatedAt", name: "Last edited time", type: "date", width: 210 },
  { id: "createdAt", name: "Created time", type: "date", width: 210 },
] as const;

const trashPropertyDefinitions = [
  { id: "deletedAt", name: "Deleted at", type: "date", width: 210 },
  { id: "deletedBy", name: "Deleted by", type: "text", width: 190 },
] as const;

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
    [downloadedItems, meetingsPayload?.meetings, navigation, mode, offlineMode],
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
  const payload = useMemo(
    () =>
      buildHomepagePayload({
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
        payload,
      }),
    [activeViewId, payload],
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

  const openHomepagePage = (pageId: string) => {
    const row = rows.find(
      (candidate) => candidate.id === pageId || candidate.openPageId === pageId,
    );

    if (row) {
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
          <p className="text-sm text-muted-foreground">
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
        <main className="min-h-0 flex-1 bg-background">
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
                  databaseConfig: payload.database.config,
                  databaseId: payload.database.id,
                  databaseName: payload.database.name,
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
                  hostDatabaseId: payload.database.id,
                  hostDatabaseName: payload.database.name,
                  hostDatabaseWorkspaceId: workspaceId ?? undefined,
                  hostViews: payload.views,
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
                    dataSourceId: payload.activeDataSource!.id,
                    fallbackIcon: view.icon,
                    id: view.id,
                    name: view.label,
                    sourceParentDatabaseId: payload.database.id,
                    type: "table",
                  })),
                  views: payload.views,
                }}
              >
                <div className="database-block-shell database-block-shell-full">
                  <div className="database-toolbar-section">
                    <h1 className="min-h-10 py-0 text-4xl font-semibold leading-tight tracking-normal text-foreground">
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
    <CreateLibraryTeamspaceDialog
      onOpenChange={setCreateTeamspaceOpen}
      open={createTeamspaceOpen}
      workspaceId={workspaceId}
    />
    </>
  );
}

function TeamspacesLibraryTable({
  onOpenRow,
  rows,
  teamspaces,
}: {
  onOpenRow: (rowId: string) => void;
  rows: HomepageRow[];
  teamspaces: Teamspace[];
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  if (teamspaces.length === 0) {
    return <div className="py-16 text-center text-sm text-muted-foreground">No teamspaces yet. Create one for a team or project.</div>;
  }

  return (
    <div className="database-table-wrap min-w-[58rem] text-sm leading-5" data-vertical-lines="true">
      <table className="database-table">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[28%]" />
          <col className="w-[14%]" />
          <col className="w-[17%]" />
          <col className="w-[11%]" />
        </colgroup>
        <thead>
          <tr>
            <th className="database-name-header"><div className="database-name-header-content">Name</div></th>
            <th><div className="database-name-header-content">Description</div></th>
            <th><div className="database-name-header-content">Type</div></th>
            <th><div className="database-name-header-content">Access</div></th>
            <th><div className="database-name-header-content">Members</div></th>
          </tr>
        </thead>
        <tbody>
      {teamspaces.map((teamspace) => {
        const expanded = expandedIds.has(teamspace.id);
        const teamspaceRows = buildTeamspaceLibraryRows(rows, teamspace.id);
        return <Fragment key={teamspace.id}>
          <tr className="group hover:bg-accent">
            <td className="database-page-cell">
              <button
                aria-expanded={expanded}
                className="flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => setExpandedIds((current) => {
              const next = new Set(current);
              if (next.has(teamspace.id)) next.delete(teamspace.id);
              else next.add(teamspace.id);
              return next;
            })}
                type="button"
              >
              <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
              {typeof teamspace.icon === "string" && teamspace.icon
                ? <PageIconDisplay size="sm" value={teamspace.icon} />
                : <Layers3Icon className="size-4 shrink-0 text-muted-foreground" />}
                <span className="truncate font-semibold">{teamspace.name}</span>
              </button>
            </td>
            <td className="truncate text-muted-foreground">{teamspace.description?.trim() || "—"}</td>
            <td className="text-muted-foreground">Teamspace</td>
            <td><span className="flex items-center gap-1.5 capitalize"><TeamspaceAccessIcon accessMode={teamspace.accessMode} />{teamspace.isDefault ? "Default" : teamspace.accessMode}</span></td>
            <td><span className="flex items-center gap-1.5"><UsersIcon className="size-4 text-muted-foreground" />{teamspace.memberCount ?? 0}</span></td>
          </tr>
          {expanded ? (
            <Fragment>
              {teamspaceRows.length > 0 ? teamspaceRows.map(({ depth, row }) => (
                <tr aria-label={`${teamspace.name} contents`} key={row.id}>
                  <td className="database-page-cell">
                    <div className="database-cell-content" style={{ paddingLeft: `${24 + depth * 16}px` }}>
                      <DatabasePageLink
                        onOpen={onOpenRow}
                        pageId={row.id}
                        pageSummary={{
                          iconKind: row.iconKind,
                          id: row.id,
                          metadata: row.metadata,
                          name: row.name,
                        }}
                      />
                    </div>
                  </td>
                  <td className="text-muted-foreground">—</td>
                  <td className="text-muted-foreground">{getHomepageRowType(row)}</td>
                  <td />
                  <td />
                </tr>
              )) : <tr aria-label={`${teamspace.name} contents`}><td className="h-8 text-muted-foreground" colSpan={5}>No pages yet</td></tr>}
            </Fragment>
          ) : null}
        </Fragment>;
      })}
        </tbody>
      </table>
    </div>
  );
}

function getHomepageRowType(row: HomepageRow) {
  if (row.itemKind === "database") return "Database";
  if (row.itemKind === "meeting") return "Meeting";
  return "Page";
}

function buildTeamspaceLibraryRows(rows: HomepageRow[], teamspaceId: string) {
  const matchingRows = rows.filter((row) => row.teamspaceId === teamspaceId);
  const matchingIds = new Set(matchingRows.map((row) => row.id));
  const childrenByParent = new Map<string | null, HomepageRow[]>();
  for (const row of matchingRows) {
    const parentId = row.parentRowId && matchingIds.has(row.parentRowId) ? row.parentRowId : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(row);
    childrenByParent.set(parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) siblings.sort((left, right) => left.position - right.position || left.name.localeCompare(right.name));
  const result: Array<{ depth: number; row: HomepageRow }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const row of childrenByParent.get(parentId) ?? []) {
      result.push({ depth, row });
      visit(row.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

function TeamspaceAccessIcon({ accessMode }: { accessMode: TeamspaceAccessMode }) {
  if (accessMode === "open") return <Globe2Icon className="size-4 text-muted-foreground" />;
  if (accessMode === "private") return <LockIcon className="size-4 text-muted-foreground" />;
  return <UsersIcon className="size-4 text-muted-foreground" />;
}

function CreateLibraryTeamspaceDialog({ open, onOpenChange, workspaceId }: { open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string | null | undefined }) {
  const create = useCreateTeamspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accessMode, setAccessMode] = useState<TeamspaceAccessMode>("closed");
  const submit = () => {
    if (!workspaceId || !name.trim()) return;
    create.mutate(
      { accessMode, description: description.trim() || null, name: name.trim(), workspaceId },
      {
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSuccess: () => {
          toast.success("Teamspace created.");
          setName("");
          setDescription("");
          onOpenChange(false);
        },
      },
    );
  };

  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent><DialogHeader><DialogTitle>New teamspace</DialogTitle><DialogDescription>Create a dedicated home for a team or project.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-2"><Label htmlFor="library-teamspace-name">Name</Label><Input id="library-teamspace-name" maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /></div><div className="grid gap-2"><Label htmlFor="library-teamspace-description">Description</Label><Textarea id="library-teamspace-description" onChange={(event) => setDescription(event.target.value)} value={description} /></div><div className="grid gap-2"><Label>Access</Label><Select onValueChange={(value) => setAccessMode(value as TeamspaceAccessMode)} value={accessMode}><SelectTrigger aria-label="Teamspace access"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open — anyone can join</SelectItem><SelectItem value="closed">Closed — members join by invite</SelectItem><SelectItem value="private">Private — visible only to members</SelectItem></SelectContent></Select></div></div><DialogFooter><Button onClick={() => onOpenChange(false)} variant="outline">Cancel</Button><Button disabled={!name.trim() || create.isPending} onClick={submit}>{create.isPending ? <Spinner /> : null}Create</Button></DialogFooter></DialogContent></Dialog>;
}

function buildHomepagePayload({
  activeViewId,
  databaseConfig,
  mode,
  workspaceId,
  propertyConfigs,
  rows,
  viewConfigs,
}: {
  activeViewId: string;
  databaseConfig: unknown;
  mode: RecentsMode;
  workspaceId: string | null | undefined;
  propertyConfigs: Record<string, unknown>;
  rows: HomepageRow[];
  viewConfigs: Record<string, unknown>;
}): DatabasePayload {
  const homepageDatabaseId = mode === "trash" ? "trash" : "homepage";
  const homepageDataSourceId = `${homepageDatabaseId}:source`;
  const propertyDefinitions =
    mode === "trash"
      ? [...homepagePropertyDefinitions, ...trashPropertyDefinitions]
      : homepagePropertyDefinitions;
  const filteredRows = applyHomepageView(rows, activeViewId as HomepageView);
  const properties: DatabaseProperty[] = propertyDefinitions.map(
    (definition, index) => {
      const propertyConfig = propertyConfigs[definition.id];
      const config =
        definition.id === "source"
          ? {
              ...(isRecord(propertyConfig) ? propertyConfig : {}),
              pageSummaries: Object.fromEntries(
                rows.flatMap((row) =>
                  row.sourcePage ? [[row.sourcePage.id, row.sourcePage]] : [],
                ),
              ),
            }
          : propertyConfig;

      return {
        createdAt: "",
        dataSourceId: homepageDataSourceId,
        id: definition.id,
        position: index,
        property: {
          config,
          createdAt: "",
          id: definition.id,
          name: definition.name,
          workspaceId: workspaceId ?? "homepage",
          type: definition.type,
          updatedAt: "",
        },
        propertyId: definition.id,
        updatedAt: "",
        visible: true,
        width: definition.width,
      };
    },
  );
  const values: PagePropertyValue[] = filteredRows.flatMap((row) =>
    propertyDefinitions.map((definition) => ({
      createdAt: row.createdAt,
      id: `${row.id}:${definition.id}`,
      propertyId: definition.id,
      updatedAt: row.updatedAt,
      value: row[definition.id] ?? "",
      pageId: row.id,
    })),
  );

  return {
    activeDataSource: {
      config: databaseConfig,
      configVersion: 1,
      createdAt: "",
      id: homepageDataSourceId,
      name: mode === "trash" ? "Trash" : "Recents",
      parentDatabaseId: homepageDatabaseId,
      updatedAt: "",
      version: 0,
      workspaceId: workspaceId ?? homepageDatabaseId,
    },
    dataSources: [
      {
        config: databaseConfig,
        configVersion: 1,
        createdAt: "",
        id: homepageDataSourceId,
        name: mode === "trash" ? "Trash" : "Recents",
        parentDatabaseId: homepageDatabaseId,
        updatedAt: "",
        version: 0,
        workspaceId: workspaceId ?? homepageDatabaseId,
      },
    ],
    database: {
      config: databaseConfig,
      createdAt: "",
      id: homepageDatabaseId,
      name: mode === "trash" ? "Trash" : "Recents",
      workspaceId: workspaceId ?? homepageDatabaseId,
      pageId: homepageDatabaseId,
      updatedAt: "",
      version: 0,
    },
    properties,
    rows: filteredRows.map((row, index) => ({
      createdAt: row.createdAt,
      dataSourceId: homepageDataSourceId,
      id: row.id,
      page: {
        createdAt: row.createdAt,
        iconKind: row.iconKind,
        id: row.id,
        metadata: row.metadata,
        name: row.name,
        updatedAt: row.updatedAt,
      },
      pageId: row.id,
      parentRowId: row.parentRowId,
      position:
        row.position === Number.MAX_SAFE_INTEGER ? index : row.position,
      updatedAt: row.updatedAt,
    })),
    values,
    views: homepageViews.map(
      (view, index): DatabaseView => ({
        config: viewConfigs[view.id],
        createdAt: "",
        databaseId: homepageDatabaseId,
        dataSourceId: homepageDataSourceId,
        id: view.id,
        name: view.label,
        position: index,
        type: "table",
        updatedAt: "",
      }),
    ),
  };
}

function buildHomepageRows(
  navigation: PageNavigationPayload,
  meetings: MeetingListItem[],
  mode: RecentsMode,
): HomepageRow[] {
  const { databases: databaseRecords, pages, placements } = navigation;
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const databases = databaseRecords.map((database) => ({
    database,
    page: database.pageId ? (pagesById.get(database.pageId) ?? null) : null,
  }));
  const showTrash = mode === "trash";
  const includePage = (page: Page) =>
    page.type !== "meeting" &&
    (showTrash ? Boolean(page.deletedAt) : !page.deletedAt);
  const includeDatabase = (database: PageDatabase, page: Page | null) =>
    showTrash
      ? Boolean(database.deletedAt ?? page?.deletedAt)
      : !database.deletedAt && !page?.deletedAt;
  const databasesById = new Map(
    databases.map(({ database, page }) => [database.id, { database, page }]),
  );
  const hierarchy = buildHomepageHierarchy(placements);
  const parentKeys = new Set(
    placements.map(
      (placement) => `${placement.parentKind}:${placement.parentId}`,
    ),
  );

  return [
    ...pages
      .filter((page) => includePage(page))
      .map((page) => {
        const sourcePage = parentKeys.has(`page:${page.id}`)
          ? null
          : resolveSourcePage(
              placements,
              pagesById,
              databasesById,
              "page",
              page.id,
            );

        return {
          createdAt: page.createdAt,
          createdBy: formatCreator(page.createdBy),
          deletedAt: page.deletedAt ?? "",
          deletedBy: formatCreator(page.deletedBy),
          iconKind: "page" as const,
          id: `page:${page.id}`,
          isFavorite: Boolean(page.isFavorite),
          isShared: Boolean(page.isShared),
          itemKind: "page" as const,
          teamspaceId: page.teamspaceId ?? null,
          lastVisitedAt: page.lastVisitedAt ?? null,
          metadata: page.metadata ?? null,
          name: page.name || "Untitled",
          openDatabaseId: null,
          openMeetingId: null,
          openPageId: page.id,
          parentRowId:
            hierarchy.parentRowIdByRowId[`page:${page.id}`] ??
            (page.parentPageId ? `page:${page.parentPageId}` : null),
          position:
            hierarchy.positionByRowId[`page:${page.id}`] ??
            Number.MAX_SAFE_INTEGER,
          source: sourcePage?.id ?? "",
          sourcePage,
          updatedAt: page.updatedAt,
        };
      }),
    ...databases
      .filter(({ database, page }) => includeDatabase(database, page))
      .map(({ database, page }) => {
        const databaseEmoji = getDatabaseEmoji({
          config: database.dataSourceConfig,
        });
        const sourcePage = parentKeys.has(`database:${database.id}`)
          ? null
          : (resolveSourcePage(
              placements,
              pagesById,
              databasesById,
              "database",
              database.id,
            ) ?? (page ? getPageSourcePage(page) : null));

        return {
          createdAt: database.createdAt,
          createdBy: formatCreator(database.createdBy ?? page?.createdBy),
          deletedAt: database.deletedAt ?? page?.deletedAt ?? "",
          deletedBy: formatCreator(database.deletedBy ?? page?.deletedBy),
          iconKind: "database" as const,
          id: `database:${database.id}`,
          isFavorite: Boolean(database.isFavorite),
          isShared: Boolean(page?.isShared),
          itemKind: "database" as const,
          teamspaceId: database.teamspaceId ?? page?.teamspaceId ?? null,
          lastVisitedAt: database.lastVisitedAt ?? null,
          metadata: databaseEmoji ? { emoji: databaseEmoji } : null,
          name: database.name || "Untitled",
          openDatabaseId: database.id,
          openMeetingId: null,
          openPageId: database.pageId,
          parentRowId:
            hierarchy.parentRowIdByRowId[`database:${database.id}`] ?? null,
          position:
            hierarchy.positionByRowId[`database:${database.id}`] ??
            Number.MAX_SAFE_INTEGER,
          source: sourcePage?.id ?? "",
          sourcePage,
          updatedAt: database.updatedAt,
        };
      }),
    ...(mode === "home" ? buildMeetingRows(meetings, pagesById) : []),
  ];
}

function buildMeetingRows(
  meetings: MeetingListItem[],
  pagesById: Map<string, Page>,
): HomepageRow[] {
  return meetings.map((meeting, index) => {
    const hostPage = pagesById.get(meeting.pageId) ?? null;
    const sourcePage = hostPage ? getPageSourcePage(hostPage) : null;

    return {
      createdAt: meeting.createdAt,
      createdBy: hostPage ? formatCreator(hostPage.createdBy) : "Unknown",
      deletedAt: meeting.deletedAt ?? "",
      deletedBy: "Unknown",
      iconKind: "page",
      id: `meeting:${meeting.id}`,
      isFavorite: false,
      isShared: false,
      itemKind: "meeting",
      lastVisitedAt: null,
      metadata: { emoji: meeting.emoji ?? DEFAULT_MEETING_ITEM_ICON },
      name: meeting.title?.trim() || "Untitled meeting",
      openDatabaseId: null,
      openMeetingId: meeting.id,
      openPageId: null,
      parentRowId: null,
      position: index,
      source: sourcePage?.id ?? "",
      sourcePage,
      teamspaceId: null,
      updatedAt: meeting.updatedAt,
    };
  });
}

function isHomepageView(value: unknown): value is HomepageView {
  return libraryViewIds.includes(value as HomepageView);
}

function resolveSourcePage(
  placements: PageItemPlacement[],
  pagesById: Map<string, Page>,
  databasesById: Map<string, { database: PageDatabase; page: Page | null }>,
  itemKind: "database" | "page",
  itemId: string,
): HomepageSourcePage | null {
  const placement = placements.find(
    (candidate) =>
      candidate.itemKind === itemKind &&
      candidate.itemId === itemId &&
      (candidate.placementKind === "primary" ||
        candidate.placementKind === "database_row"),
  );

  if (!placement) {
    return null;
  }

  if (placement.parentKind === "page") {
    const parentPage = pagesById.get(placement.parentId);

    return parentPage ? getPageSourcePage(parentPage) : null;
  }

  if (placement.parentKind === "database") {
    const parentDatabase = databasesById.get(placement.parentId)?.database;

    return parentDatabase ? getDatabaseSourcePage(parentDatabase) : null;
  }

  return null;
}

function getPageSourcePage(page: Page): HomepageSourcePage {
  return {
    iconKind: "page",
    id: `page:${page.id}`,
    metadata: page.metadata ?? null,
    name: page.name?.trim() || "Untitled",
  };
}

function getDatabaseSourcePage(database: PageDatabase): HomepageSourcePage {
  const emoji = getDatabaseEmoji({ config: database.dataSourceConfig });

  return {
    iconKind: "database",
    id: `database:${database.id}`,
    metadata: emoji ? { emoji } : null,
    name: database.name?.trim() || "Untitled",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function applyHomepageView(rows: HomepageRow[], view: HomepageView) {
  switch (view) {
    case "favourites":
      return rows.filter((row) => row.itemKind !== "meeting" && row.isFavorite);
    case "meetings":
      return rows.filter((row) => row.itemKind === "meeting");
    case "shared":
      return rows.filter(
        (row) => row.itemKind !== "meeting" && row.isShared && !row.teamspaceId,
      );
    case "teamspaces":
      return rows.filter(
        (row) => row.itemKind !== "meeting" && Boolean(row.teamspaceId),
      );
    case "private":
      return rows.filter(
        (row) => row.itemKind !== "meeting" && !row.isShared && !row.teamspaceId,
      );
    case "recents":
    default:
      return rows.filter((row) => row.itemKind !== "meeting");
  }
}

function formatCreator(
  creator: Page["createdBy"] | PageDatabase["createdBy"] | undefined,
) {
  return creator?.name?.trim() || creator?.email?.trim() || "Unknown";
}
