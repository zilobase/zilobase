import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ChevronDown, Database, FileText, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DatabaseTableView } from "@/packages/editor/extensions/database/table"
import { DatabaseViewProvider } from "@/packages/editor/extensions/database/shared/database-view-context"
import { DatabaseViewToolbar } from "@/packages/editor/extensions/database/shared/database-view-toolbar"
import { getDatabaseViewModel } from "@/packages/editor/extensions/database/shared/database-view-model"
import {
  getMergedDatabaseConfig,
  getMergedNameColumnConfig,
  getMergedPropertyConfig,
  type DatabaseNameColumnConfig,
  type DatabasePropertyConfig,
  type DatabaseSortConfig,
} from "@/packages/editor/extensions/database/shared/database-view-config"
import { getDatabaseEmoji, useCreateDatabase } from "@notelab/features/databases"
import { useActiveOrganizationId } from "@notelab/features/integrations"
import {
  useCreateWorkspace,
  useWorkspaces,
  type Workspace,
  type WorkspaceDatabase,
  type WorkspaceItemPlacement,
} from "@notelab/features/workspaces"
import type {
  DatabasePayload,
  DatabaseProperty,
  DatabaseView,
  WorkspacePropertyValue,
} from "@notelab/features/databases"

type HomepageView = "recents" | "favourites" | "shared" | "private"

type HomepageRow = {
  createdAt: string
  createdBy: string
  iconKind: "database" | "page"
  id: string
  isDatabase: boolean
  isFavorite: boolean
  isTeamspace: boolean
  itemId: string
  itemKind: "database" | "workspace"
  lastVisitedAt: string | null
  metadata: Workspace["metadata"] | null
  name: string
  source: string
  updatedAt: string
}

const homepageViews: Array<{ id: HomepageView; label: string }> = [
  { id: "recents", label: "Recents" },
  { id: "favourites", label: "Favourites" },
  { id: "shared", label: "Shared" },
  { id: "private", label: "Private" },
]

const homepagePropertyDefinitions = [
  { id: "source", name: "Source", type: "text", width: 220 },
  { id: "createdBy", name: "Created by", type: "text", width: 190 },
  { id: "lastVisitedAt", name: "Last visited time", type: "date", width: 210 },
  { id: "updatedAt", name: "Last edited time", type: "date", width: 210 },
  { id: "createdAt", name: "Created time", type: "date", width: 210 },
] as const

const emptyAsync = async () => undefined

export default function DashboardPage() {
  const navigate = useNavigate()
  const organizationId = useActiveOrganizationId()
  const { data: workspaces = [], isLoading } = useWorkspaces(organizationId)
  const createWorkspace = useCreateWorkspace()
  const createDatabase = useCreateDatabase()
  const [activeViewId, setActiveViewId] = useState<string | null>("recents")
  const [databaseConfig, setDatabaseConfig] = useState<unknown>({
    nameColumn: {
      label: "Page name",
      showPageIcon: true,
    },
  })
  const [propertyConfigs, setPropertyConfigs] = useState<Record<string, unknown>>({})
  const [viewConfigs, setViewConfigs] = useState<Record<string, unknown>>({
    recents: {
      sorts: [{ column: "lastVisitedAt", direction: "descending" }],
    },
  })
  const rows = useMemo(() => buildHomepageRows(workspaces), [workspaces])
  const payload = useMemo(
    () =>
      buildHomepagePayload({
        activeViewId: activeViewId ?? "recents",
        databaseConfig,
        organizationId,
        propertyConfigs,
        rows,
        viewConfigs,
      }),
    [
      activeViewId,
      databaseConfig,
      organizationId,
      propertyConfigs,
      rows,
      viewConfigs,
    ],
  )
  const viewModel = useMemo(
    () =>
      getDatabaseViewModel({
        activeViewId,
        payload,
      }),
    [activeViewId, payload],
  )
  const activeView = viewModel.activeView
  const updateActiveViewConfig = (nextConfig: unknown) => {
    if (!activeViewId) {
      return
    }

    setViewConfigs((current) => ({
      ...current,
      [activeViewId]: nextConfig,
    }))
  }
  const saveDatabaseSorts = async (sorts: DatabaseSortConfig[]) => {
    updateActiveViewConfig(
      getMergedDatabaseConfig(activeView?.config, {
        sort: undefined,
        sorts,
      }),
    )
  }
  const setViewGroupProperty = (groupPropertyId: string | null) => {
    updateActiveViewConfig(
      getMergedDatabaseConfig(activeView?.config, {
        groupPropertyId: groupPropertyId ?? undefined,
      }),
    )
  }
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
    }))
  }
  const updateNameColumnConfig = (config: unknown) => {
    setDatabaseConfig((current: unknown) =>
      getMergedNameColumnConfig(current, config as DatabaseNameColumnConfig),
    )
  }
  const isCreating = createWorkspace.isPending || createDatabase.isPending

  const createPage = async () => {
    if (!organizationId || createWorkspace.isPending) {
      return
    }

    try {
      const workspace = await createWorkspace.mutateAsync({ organizationId })

      await navigate({
        params: { workspaceId: workspace.id },
        to: "/workspace/$workspaceId",
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create page.")
    }
  }

  const createStandaloneDatabase = async () => {
    if (!organizationId || createWorkspace.isPending || createDatabase.isPending) {
      return
    }

    try {
      const workspace = await createWorkspace.mutateAsync({ organizationId })
      const payload = await createDatabase.mutateAsync({
        organizationId,
        pageId: workspace.id,
        standalone: true,
      })

      await navigate({
        params: { databaseId: payload.database.id },
        search: { view: undefined },
        to: "/database/$databaseId",
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create database.",
      )
    }
  }

  const openHomepagePage = (pageId: string) => {
    const separatorIndex = pageId.indexOf(":")
    const kind = pageId.slice(0, separatorIndex)
    const id = pageId.slice(separatorIndex + 1)

    if (kind === "database") {
      void navigate({
        params: { databaseId: id },
        search: { view: undefined },
        to: "/database/$databaseId",
      })
      return
    }

    void navigate({
      params: { workspaceId: id },
      to: "/workspace/$workspaceId",
    })
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <section className="animate-in fade-in-0 duration-300">
        <div className="tiptap-editor px-5 pb-10 pt-12 sm:px-8 md:px-20 lg:px-24">
          <DatabaseViewProvider
            value={{
              ...viewModel,
              activePropertyValueKey: null,
              activeViewTabId: activeViewId,
              addDatabaseProperty: () => {},
              addDatabaseRow: () => {},
              addDraggedPageRow: () => {},
              addKanbanView: () => {},
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
              databaseOrganizationId: organizationId ?? undefined,
              deleteDatabaseView: () => {},
              draftDatabaseTitle: "Home",
              draftPropertyValues: {},
              draftViewTitle:
                homepageViews.find((view) => view.id === activeViewId)?.label ??
                "Recents",
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
              hostDatabaseOrganizationId: organizationId ?? undefined,
              hostViews: payload.views,
              isAddingDatabaseProperty: false,
              isAddingDatabaseRow: false,
              isAddingDatabaseView: false,
              isFetchingNextPage: false,
              linkedDatabaseViews: [],
              onOpenPage: openHomepagePage,
              onShowTitleChange: undefined,
              options: viewModel.kanbanOptions,
              organizationId,
              removeDatabaseFilter: () => {},
              removeDatabaseSort: () => {},
              renameDatabaseProperty: () => {},
              reorderDatabaseFilters: () => {},
              saveDatabaseConditionalColors: () => {},
              saveDatabaseEmoji: () => {},
              saveDatabaseFilters: () => {},
              saveDatabaseSorts,
              saveDatabaseTitle: () => {},
              saveDatabaseViewTitle: () => {},
              savePropertyValue: () => {},
              setActivePropertyValueKey: () => {},
              setActiveViewId,
              setDraftDatabaseTitle: () => {},
              setDraftPropertyValues: () => {},
              setDraftViewTitle: () => {},
              setFilterPickerOpen: () => {},
              setSortPickerOpen: () => {},
              setViewDateProperty: () => {},
              setViewGroupProperty,
              setViewType: () => {},
              showExpandButton: false,
              showFilterPill: false,
              showSortPill: false,
              showTitle: true,
              sortPickerOpen: false,
              toggleFilterPillVisibility: () => {},
              togglePropertyVisibility: (propertyId) => {
                void updateDatabasePropertyConfig(propertyId, { hidden: true })
              },
              toggleSortPillVisibility: () => {},
              updateDatabaseFilter: () => {},
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="database-new-button mt-2 shrink-0"
                        disabled={!organizationId || isCreating}
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
                      <DropdownMenuItem onSelect={() => void createPage()}>
                        <FileText />
                        <span>Page</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="database-scroll-section">
                {isLoading ? (
                  <div className="database-empty-state">
                    <Loader2 className="animate-spin" />
                    <span>Loading pages...</span>
                  </div>
                ) : (
                  <DatabaseTableView />
                )}
              </div>
            </div>
          </DatabaseViewProvider>
        </div>
      </section>
    </main>
  )
}

function buildHomepagePayload({
  activeViewId,
  databaseConfig,
  organizationId,
  propertyConfigs,
  rows,
  viewConfigs,
}: {
  activeViewId: string
  databaseConfig: unknown
  organizationId: string | null | undefined
  propertyConfigs: Record<string, unknown>
  rows: HomepageRow[]
  viewConfigs: Record<string, unknown>
}): DatabasePayload {
  const filteredRows = applyHomepageView(rows, activeViewId as HomepageView)
  const properties: DatabaseProperty[] = homepagePropertyDefinitions.map(
    (definition, index) => ({
      createdAt: "",
      databaseId: "homepage",
      id: definition.id,
      position: index,
      property: {
        config: propertyConfigs[definition.id],
        createdAt: "",
        id: definition.id,
        name: definition.name,
        organizationId: organizationId ?? "homepage",
        type: definition.type,
        updatedAt: "",
      },
      propertyId: definition.id,
      updatedAt: "",
      visible: true,
      width: definition.width,
    }),
  )
  const values: WorkspacePropertyValue[] = filteredRows.flatMap((row) =>
    homepagePropertyDefinitions.map((definition) => ({
      createdAt: row.createdAt,
      id: `${row.id}:${definition.id}`,
      propertyId: definition.id,
      updatedAt: row.updatedAt,
      value: row[definition.id] ?? "",
      workspaceId: row.id,
    })),
  )

  return {
    database: {
      config: databaseConfig,
      createdAt: "",
      id: "homepage",
      name: "Home",
      organizationId: organizationId ?? "homepage",
      pageId: "homepage",
      updatedAt: "",
    },
    properties,
    rows: filteredRows.map((row, index) => ({
      createdAt: row.createdAt,
      databaseId: "homepage",
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
    views: homepageViews.map((view, index): DatabaseView => ({
      config: viewConfigs[view.id],
      createdAt: "",
      databaseId: "homepage",
      id: view.id,
      name: view.label,
      position: index,
      type: "table",
      updatedAt: "",
    })),
  }
}

function buildHomepageRows(workspaces: Workspace[]): HomepageRow[] {
  const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  const databases = workspaces.flatMap((workspace) =>
    (workspace.databases ?? []).map((database) => ({ database, workspace })),
  )
  const databasesById = new Map(
    databases.map(({ database, workspace }) => [database.id, { database, workspace }]),
  )
  const standaloneDatabasePageIds = new Set(
    databases
      .filter(({ database }) => isStandaloneDatabase(database))
      .map(({ database }) => database.pageId),
  )
  const placements = workspaces.flatMap(
    (workspace) => workspace.navigationPlacements ?? [],
  )

  return [
    ...workspaces
      .filter((workspace) => !standaloneDatabasePageIds.has(workspace.id))
      .map((workspace) => ({
        createdAt: workspace.createdAt,
        createdBy: formatCreator(workspace.createdBy),
        iconKind: "page" as const,
        id: `workspace:${workspace.id}`,
        isDatabase: false,
        isFavorite: Boolean(workspace.isFavorite),
        isTeamspace: Boolean(workspace.isTeamspace),
        itemId: workspace.id,
        itemKind: "workspace" as const,
        lastVisitedAt: workspace.lastVisitedAt ?? null,
        metadata: workspace.metadata ?? null,
        name: workspace.name || "Untitled",
        source: resolveSourceLabel(
          placements,
          workspacesById,
          databasesById,
          "workspace",
          workspace.id,
        ),
        updatedAt: workspace.updatedAt,
      })),
    ...databases.map(({ database, workspace }) => {
      const databaseEmoji = getDatabaseEmoji(database)

      return {
        createdAt: database.createdAt,
        createdBy: formatCreator(database.createdBy ?? workspace.createdBy),
        iconKind: "database" as const,
        id: `database:${database.id}`,
        isDatabase: true,
        isFavorite: Boolean(database.isFavorite),
        isTeamspace: Boolean(workspace.isTeamspace),
        itemId: database.id,
        itemKind: "database" as const,
        lastVisitedAt: database.lastVisitedAt ?? null,
        metadata: databaseEmoji ? { emoji: databaseEmoji } : null,
        name: database.name || "Untitled",
        source:
          resolveSourceLabel(
            placements,
            workspacesById,
            databasesById,
            "database",
            database.id,
          ) || workspace.name || "Workspace",
        updatedAt: database.updatedAt,
      }
    }),
  ]
}

function resolveSourceLabel(
  placements: WorkspaceItemPlacement[],
  workspacesById: Map<string, Workspace>,
  databasesById: Map<string, { database: WorkspaceDatabase; workspace: Workspace }>,
  itemKind: "database" | "workspace",
  itemId: string,
) {
  const placement = placements.find(
    (candidate) =>
      candidate.itemKind === itemKind &&
      candidate.itemId === itemId &&
      (candidate.placementKind === "primary" ||
        candidate.placementKind === "database_row"),
  )

  if (!placement) {
    return ""
  }

  if (placement.parentKind === "workspace") {
    return workspacesById.get(placement.parentId)?.name ?? ""
  }

  if (placement.parentKind === "database") {
    return databasesById.get(placement.parentId)?.database.name ?? ""
  }

  return ""
}

function isStandaloneDatabase(database: WorkspaceDatabase) {
  if (!database.config || typeof database.config !== "object") {
    return true
  }

  return !("parentItemId" in database.config)
}

function applyHomepageView(rows: HomepageRow[], view: HomepageView) {
  switch (view) {
    case "favourites":
      return rows.filter((row) => row.isFavorite)
    case "shared":
      return rows.filter((row) => row.isTeamspace)
    case "private":
      return rows.filter((row) => !row.isTeamspace)
    case "recents":
    default:
      return rows
  }
}

function formatCreator(
  creator: Workspace["createdBy"] | WorkspaceDatabase["createdBy"] | undefined,
) {
  return creator?.name?.trim() || creator?.email?.trim() || "Unknown"
}
