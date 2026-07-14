import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Database, FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageSidePaneLayout, usePageSidePane } from "@/contexts/page-side-pane";
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page";
import { PageEditorPane } from "@/pages/page";
import { DatabaseMainPane } from "@/pages/database";
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
} from "@notelab/features/databases";
import { useActiveWorkspaceId } from "@notelab/features/integrations";
import {
  useCreatePage,
  usePageNavigation,
  type Page,
  type PageDatabase,
  type PageItemPlacement,
  type PageNavigationPayload,
} from "@notelab/features/pages";
import type {
  DatabasePayload,
  DatabaseProperty,
  DatabaseView,
  PagePropertyValue,
} from "@notelab/features/databases";

type HomepageView = "recents" | "favourites" | "shared" | "private";

type DashboardMode = "home" | "trash";

type HomepageRow = {
  createdAt: string;
  createdBy: string;
  deletedAt: string;
  deletedBy: string;
  iconKind: "database" | "page";
  id: string;
  isFavorite: boolean;
  isTeamspace: boolean;
  lastVisitedAt: string | null;
  metadata: Page["metadata"] | null;
  name: string;
  openDatabaseId: string | null;
  openPageId: string | null;
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

const homepageViews: Array<{ id: HomepageView; label: string }> = [
  { id: "recents", label: "Recents" },
  { id: "favourites", label: "Favourites" },
  { id: "shared", label: "Shared" },
  { id: "private", label: "Private" },
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

export default function DashboardPage({
  mode = "home",
}: {
  mode?: DashboardMode;
}) {
  const navigate = useNavigate();
  const workspaceId = useActiveWorkspaceId();
  const { data: navigation, isLoading } = usePageNavigation(workspaceId, {
    deleted: mode === "trash" ? "only" : "active",
  });
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
  const [databaseConfig, setDatabaseConfig] = useState<unknown>({
    nameColumn: {
      label: "Page name",
      showPageIcon: true,
    },
  });
  const [propertyConfigs, setPropertyConfigs] = useState<
    Record<string, unknown>
  >({});
  const [viewConfigs, setViewConfigs] = useState<Record<string, unknown>>({
    recents: {
      sorts: [{ column: "lastVisitedAt", direction: "descending" }],
    },
  });
  const rows = useMemo(
    () =>
      buildHomepageRows(
        navigation ?? { databases: [], pages: [], placements: [] },
        mode,
      ),
    [navigation, mode],
  );
  const pageTitle = mode === "trash" ? "Trash" : "Home";
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

  return (
    <PageSidePaneLayout
      main={
        <main className="min-h-0 flex-1 bg-background">
          <section className="animate-in fade-in-0 duration-300">
            <div className="tiptap-editor px-5 pb-10 pt-12 sm:px-8 md:px-20 lg:px-24">
              <DatabaseViewProvider
                value={{
                  ...viewModel,
                  activeViewTabId: activeViewId,
                  addDatabaseProperty: () => {},
                  addDatabaseRow: () => {},
                  addChartView: () => {},
                  addGalleryView: () => {},
                  addDraggedPageRow: () => {},
                  addKanbanView: () => {},
                  addListView: () => {},
                  addLinkedDatabaseView: () => {},
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
                  linkedDatabaseViews: [],
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
                  saveDatabaseViewTitle: () => {},
                  savePropertyValue: () => {},
                  setActiveViewId,
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
                  showTitle: true,
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
                  updateNameColumnConfig,
                  viewTabs: homepageViews.map((view) => ({
                    id: view.id,
                    name: view.label,
                    type: "table",
                  })),
                  views: payload.views,
                }}
              >
                <div className="database-block-shell database-block-shell-full">
                  <div className="database-toolbar-section">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <DatabaseViewToolbar />
                      </div>
                      {mode === "home" ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              className="database-new-button mt-2 shrink-0"
                              disabled={!workspaceId || isCreating}
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
                    {isLoading ? (
                      <DatabaseViewSkeleton viewType="table" />
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
  );
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
  mode: DashboardMode;
  workspaceId: string | null | undefined;
  propertyConfigs: Record<string, unknown>;
  rows: HomepageRow[];
  viewConfigs: Record<string, unknown>;
}): DatabasePayload {
  const homepageDatabaseId = mode === "trash" ? "trash" : "homepage";
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
        databaseId: homepageDatabaseId,
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
    database: {
      config: databaseConfig,
      createdAt: "",
      id: homepageDatabaseId,
      name: mode === "trash" ? "Trash" : "Home",
      workspaceId: workspaceId ?? homepageDatabaseId,
      pageId: homepageDatabaseId,
      updatedAt: "",
      version: 0,
    },
    properties,
    rows: filteredRows.map((row, index) => ({
      createdAt: row.createdAt,
      databaseId: homepageDatabaseId,
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
      position: index,
      updatedAt: row.updatedAt,
    })),
    values,
    views: homepageViews.map(
      (view, index): DatabaseView => ({
        config: viewConfigs[view.id],
        createdAt: "",
        databaseId: homepageDatabaseId,
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
  mode: DashboardMode,
): HomepageRow[] {
  const { databases: databaseRecords, pages, placements } = navigation;
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const databases = databaseRecords.map((database) => ({
    database,
    page: database.pageId ? (pagesById.get(database.pageId) ?? null) : null,
  }));
  const showTrash = mode === "trash";
  const includePage = (page: Page) =>
    showTrash ? Boolean(page.deletedAt) : !page.deletedAt;
  const includeDatabase = (database: PageDatabase, page: Page | null) =>
    showTrash
      ? Boolean(database.deletedAt ?? page?.deletedAt)
      : !database.deletedAt && !page?.deletedAt;
  const databasesById = new Map(
    databases.map(({ database, page }) => [database.id, { database, page }]),
  );
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
          isTeamspace: Boolean(page.isTeamspace),
          lastVisitedAt: page.lastVisitedAt ?? null,
          metadata: page.metadata ?? null,
          name: page.name || "Untitled",
          openDatabaseId: null,
          openPageId: page.id,
          source: sourcePage?.id ?? "",
          sourcePage,
          updatedAt: page.updatedAt,
        };
      }),
    ...databases
      .filter(({ database, page }) => includeDatabase(database, page))
      .map(({ database, page }) => {
        const databaseEmoji = getDatabaseEmoji(database);
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
          isTeamspace: Boolean(page?.isTeamspace),
          lastVisitedAt: database.lastVisitedAt ?? null,
          metadata: databaseEmoji ? { emoji: databaseEmoji } : null,
          name: database.name || "Untitled",
          openDatabaseId: database.id,
          openPageId: database.pageId,
          source: sourcePage?.id ?? "",
          sourcePage,
          updatedAt: database.updatedAt,
        };
      }),
  ];
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
  const emoji = getDatabaseEmoji(database);

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
      return rows.filter((row) => row.isFavorite);
    case "shared":
      return rows.filter((row) => row.isTeamspace);
    case "private":
      return rows.filter((row) => !row.isTeamspace);
    case "recents":
    default:
      return rows;
  }
}

function formatCreator(
  creator: Page["createdBy"] | PageDatabase["createdBy"] | undefined,
) {
  return creator?.name?.trim() || creator?.email?.trim() || "Unknown";
}
