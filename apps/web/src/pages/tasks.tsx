import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useQueries } from "@tanstack/react-query"
import {
  CheckCircle2Icon,
  DatabaseIcon,
  Loader2Icon,
  PlusIcon,
  Settings2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DatabaseViewProvider } from "@/editor/extensions/database/views/database-view-context"
import { DatabaseViewToolbar } from "@/editor/extensions/database/views/database-view-toolbar"
import { DatabaseViewSkeleton } from "@/editor/extensions/database/views/database-view-skeleton"
import { DatabaseListView } from "@/editor/extensions/database/views/list/database-list-view"
import {
  createSampleRowContent,
  DatabaseSetupCard,
  type DatabaseSetupSelection,
} from "@/editor/extensions/database/setup/database-setup-card"
import { getDatabaseSetupTemplate } from "@/editor/extensions/database/setup/database-setup-templates"
import { getDatabaseViewModel } from "@/editor/extensions/database/views/database-view-model"
import {
  getDatabaseFilterOperatorsForType,
  getMergedDatabaseConfig,
  getMergedNameColumnConfig,
  getMergedPropertyConfig,
  getValidDatabaseFilterOperator,
  type DatabaseConditionalColorConfig,
  type DatabaseFilterItemConfig,
  type DatabasePropertyConfig,
  type DatabaseSortConfig,
  type DatabaseSubItemsSettings,
} from "@/editor/extensions/database/views/database-view-config"
import type { DatabaseFilterUpdatePatch } from "@/editor/extensions/database/views/database-filter-menu"
import type { DatabaseSortUpdatePatch } from "@/editor/extensions/database/views/database-sort-menu"
import {
  serializePropertyValue,
  type DatabasePropertyValue,
} from "@/editor/extensions/database/core/utils"
import { defaultStatusOptions } from "@/editor/extensions/database/core/database-property-types"
import { getDatabaseEmoji } from "@zilobase/features/databases"
import {
  databaseQueryOptions,
  useAddDatabaseRow,
  useApplyDatabaseTemplate,
  useCreateDatabase,
  useUpdateDatabasePropertyValue,
  type DatabasePayload,
  type DatabaseProperty,
  type DatabaseView,
  type PagePropertyValue,
} from "@zilobase/features/databases"
import { useZilobaseFeatures } from "@zilobase/features"
import { useSession } from "@zilobase/features/auth"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import { usePageNavigation } from "@zilobase/features/pages"
import {
  defaultUserSettings,
  normalizeSidebarConfig,
  resolveSidebarWorkspaceLayout,
  withSidebarWorkspaceLayout,
  useUpdateUserSettings,
  useUserSettings,
} from "@zilobase/features/user-settings"
import { useWorkspaceAccessTargets } from "@zilobase/features/workspaces"
import {
  buildTaskRows,
  filterMyTaskRows,
  getSelectOptions,
  getTaskDatabaseSchema,
  getTaskStatusForCompletion,
  type TaskRow,
} from "@/pages/tasks-model"

const TASKS_DATABASE_ID = "my-tasks"
const TASKS_DATA_SOURCE_ID = "my-tasks:source"
const TASKS_VIEW_ID = "my-tasks-list"
const STATUS_COLUMN_ID = "my-tasks-status-column"
const STATUS_PROPERTY_ID = "my-tasks-status"
const ASSIGNEE_COLUMN_ID = "my-tasks-assignee-column"
const ASSIGNEE_PROPERTY_ID = "my-tasks-assignee"
const DUE_DATE_COLUMN_ID = "my-tasks-due-date-column"
const DUE_DATE_PROPERTY_ID = "my-tasks-due-date"
const SOURCE_COLUMN_ID = "my-tasks-source-column"
const SOURCE_PROPERTY_ID = "my-tasks-source"
const emptyAsync = async () => undefined

export default function TasksPage() {
  const workspaceId = useActiveWorkspaceId()
  const { apiFetch } = useZilobaseFeatures()
  const { data: session } = useSession()
  const { data: navigation, isLoading: navigationLoading } =
    usePageNavigation(workspaceId)
  const { data: userSettings = defaultUserSettings } = useUserSettings()
  const { data: accessTargets } = useWorkspaceAccessTargets(workspaceId)
  const updateUserSettings = useUpdateUserSettings()
  const createDatabase = useCreateDatabase()
  const applyTemplate = useApplyDatabaseTemplate()
  const sidebarConfig = useMemo(
    () => normalizeSidebarConfig(userSettings.sidebarConfig),
    [userSettings.sidebarConfig]
  )
  const sidebarLayout = useMemo(
    () => resolveSidebarWorkspaceLayout(sidebarConfig, workspaceId),
    [sidebarConfig, workspaceId]
  )
  const selectedDatabaseIds = sidebarLayout.taskDatabaseIds
  const databaseQueries = useQueries({
    queries: selectedDatabaseIds.map((databaseId) =>
      databaseQueryOptions(apiFetch, databaseId)
    ),
  })
  const payloads = databaseQueries
    .map((query) => query.data)
    .filter((payload): payload is DatabasePayload => Boolean(payload))
  const isLoading =
    navigationLoading || databaseQueries.some((query) => query.isLoading)
  const eligiblePayloads = payloads.filter(
    (payload) => getTaskDatabaseSchema(payload).missing.length === 0
  )
  const allRows = useMemo(
    () => buildTaskRows(eligiblePayloads),
    [eligiblePayloads]
  )
  const currentUserId = session?.user?.id ?? null
  const myRows = filterMyTaskRows(allRows, currentUserId)
  const [configurationOpen, setConfigurationOpen] = useState(false)

  const saveTaskDatabaseIds = async (taskDatabaseIds: string[]) => {
    if (!workspaceId) return
    await updateUserSettings.mutateAsync({
      sidebarConfig: withSidebarWorkspaceLayout(sidebarConfig, workspaceId, {
        ...sidebarLayout,
        taskDatabaseIds,
      }),
    })
  }

  const selectTaskDataSource = async (selection: DatabaseSetupSelection) => {
    try {
      await createTaskDatabase({
        applyTemplate,
        createDatabase,
        saveTaskDatabaseIds,
        selection,
        selectedDatabaseIds,
        workspaceId,
      })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create the task database."
      )
    }
  }
  const addTaskDataSource = () =>
    selectTaskDataSource({
      databaseName: "Tasks Tracker",
      templateId: "tasks-tracker",
    })

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <section className="animate-in fade-in-0 duration-300">
        <TasksPageHeader />
        <div className="tiptap-editor px-5 pb-10 sm:px-8 md:px-20 lg:px-24">
          {selectedDatabaseIds.length === 0 && !isLoading ? (
            <TasksEmptyState
              creating={createDatabase.isPending || applyTemplate.isPending}
              onConfigure={() => setConfigurationOpen(true)}
              onCreateDatabase={addTaskDataSource}
            />
          ) : (
            <>
              <DatabaseWarnings payloads={payloads} />
              <TasksDatabaseView
                accessTargets={accessTargets}
                currentUserId={currentUserId}
                isLoading={isLoading}
                isAddingDataSource={
                  createDatabase.isPending || applyTemplate.isPending
                }
                onConfigureDataSources={() => setConfigurationOpen(true)}
                onSelectDataSource={selectTaskDataSource}
                payloads={eligiblePayloads}
                rows={myRows}
                workspaceId={workspaceId}
              />
            </>
          )}
        </div>
      </section>

      <ConfigureTaskDatabasesDialog
        databases={navigation?.databases ?? []}
        onOpenChange={setConfigurationOpen}
        onSave={saveTaskDatabaseIds}
        open={configurationOpen}
        selectedDatabaseIds={selectedDatabaseIds}
      />
    </main>
  )
}

function TasksPageHeader() {
  return (
    <div className="relative px-5 pb-0 pt-1 sm:px-8 md:px-20 lg:px-24">
      <div className="relative mb-1 min-h-8" />
      <div className="flex items-start gap-3">
        <h1 className="min-h-10 min-w-0 flex-1 px-3 py-0 text-4xl font-semibold leading-tight tracking-normal text-balance text-foreground">
          My Tasks
        </h1>
      </div>
    </div>
  )
}

function TasksDatabaseView({
  accessTargets,
  currentUserId,
  isLoading,
  isAddingDataSource,
  onConfigureDataSources,
  onSelectDataSource,
  payloads,
  rows,
  workspaceId,
}: {
  accessTargets:
    { members: Array<{ email: string; id: string; name: string }> } | undefined
  currentUserId: string | null
  isLoading: boolean
  isAddingDataSource: boolean
  onConfigureDataSources: () => void
  onSelectDataSource: (selection: DatabaseSetupSelection) => Promise<void>
  payloads: DatabasePayload[]
  rows: TaskRow[]
  workspaceId: string | null | undefined
}) {
  const navigate = useNavigate()
  const updateValue = useUpdateDatabasePropertyValue()
  const addRow = useAddDatabaseRow()
  const [dataSourceSetupOpen, setDataSourceSetupOpen] = useState(false)
  const [activeViewId, setActiveViewId] = useState<string | null>(TASKS_VIEW_ID)
  const [databaseConfig, setDatabaseConfig] = useState<unknown>({
    nameColumn: { label: "Task", showPageIcon: true },
  })
  const [propertyConfigs, setPropertyConfigs] = useState<
    Record<string, unknown>
  >({})
  const [viewConfig, setViewConfig] = useState<unknown>({
    sorts: [{ column: DUE_DATE_COLUMN_ID, direction: "ascending" }],
  })
  const [filterPickerOpen, setFilterPickerOpen] = useState(false)
  const [sortPickerOpen, setSortPickerOpen] = useState(false)
  const [showFilterPill, setShowFilterPill] = useState(false)
  const [showSortPill, setShowSortPill] = useState(false)
  const [showPropertyTitles, setShowPropertyTitles] = useState(false)
  const payload = useMemo(
    () =>
      buildTasksPayload({
        databaseConfig,
        propertyConfigs,
        rows,
        sourcePayloads: payloads,
        viewConfig,
        workspaceId,
      }),
    [databaseConfig, payloads, propertyConfigs, rows, viewConfig, workspaceId]
  )
  const viewModel = useMemo(
    () =>
      getDatabaseViewModel({
        accessTargets,
        activeViewId,
        currentUserId: currentUserId ?? undefined,
        payload,
      }),
    [accessTargets, activeViewId, currentUserId, payload]
  )
  const rowsBySyntheticId = useMemo(
    () => new Map(rows.map((row) => [getSyntheticRowId(row), row])),
    [rows]
  )
  const sourcePayloadById = useMemo(
    () => new Map(payloads.map((source) => [source.database.id, source])),
    [payloads]
  )
  const updateViewConfig = (patch: Record<string, unknown>) => {
    setViewConfig((current: unknown) => getMergedDatabaseConfig(current, patch))
  }
  const saveDatabaseSorts = async (sorts: DatabaseSortConfig[]) => {
    updateViewConfig({ sorts: sorts.length > 0 ? sorts : undefined })
  }
  const saveDatabaseFilters = (filters: DatabaseFilterItemConfig[]) => {
    updateViewConfig({ filters: filters.length > 0 ? filters : undefined })
  }
  const plainFilters = () =>
    viewModel.activeDatabaseFilters.map(
      ({ id, operator, propertyId, values }) => ({
        id,
        operator,
        propertyId,
        values,
      })
    )
  const getPropertyType = (propertyId: string) =>
    propertyId === "name"
      ? "text"
      : (payload.properties.find((property) => property.id === propertyId)
          ?.property.type ?? "text")
  const savePropertyValue = (
    rowId: string,
    propertyId: string,
    _propertyType: string,
    _currentValue: DatabasePropertyValue,
    nextValue: DatabasePropertyValue
  ) => {
    const task = rowsBySyntheticId.get(rowId)
    const sourcePayload = task ? sourcePayloadById.get(task.databaseId) : null
    if (!task || !sourcePayload) return
    const schema = getTaskDatabaseSchema(sourcePayload)
    const sourceProperty =
      propertyId === STATUS_PROPERTY_ID
        ? schema.status
        : propertyId === ASSIGNEE_PROPERTY_ID
          ? schema.assignee
          : propertyId === DUE_DATE_PROPERTY_ID
            ? schema.dueDate
            : null
    if (!sourceProperty) return

    updateValue.mutate(
      {
        databaseId: task.databaseId,
        propertyId: sourceProperty.property.id,
        rowId: task.rowId,
        value: nextValue || null,
      },
      {
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : "Could not update task."
          ),
      }
    )
  }
  const updateDatabasePropertyConfig = async (
    databasePropertyId: string,
    config: unknown
  ) => {
    setPropertyConfigs((current) => ({
      ...current,
      [databasePropertyId]: getMergedPropertyConfig(
        current[databasePropertyId],
        config as DatabasePropertyConfig
      ),
    }))
  }
  const updateDatabaseFilter = (
    index: number,
    patch: DatabaseFilterUpdatePatch
  ) => {
    saveDatabaseFilters(
      plainFilters().map((filter, filterIndex) => {
        if (filterIndex !== index) return filter
        const propertyId = patch.propertyId ?? filter.propertyId
        const propertyType = getPropertyType(propertyId)
        return {
          ...filter,
          operator: patch.operator
            ? getValidDatabaseFilterOperator(patch.operator, propertyType)
            : filter.operator,
          propertyId,
          values:
            patch.values ??
            (propertyId === filter.propertyId ? filter.values : []),
        }
      })
    )
  }
  const updateDatabaseSort = (
    index: number,
    patch: DatabaseSortUpdatePatch
  ) => {
    void saveDatabaseSorts(
      viewModel.activeDatabaseSorts.map(({ column, direction }, sortIndex) =>
        sortIndex === index
          ? { column, direction, ...patch }
          : { column, direction }
      )
    )
  }
  const createTask = () => {
    const sourcePayload = payloads[0]
    if (!sourcePayload || addRow.isPending) return

    const schema = getTaskDatabaseSchema(sourcePayload)
    if (!schema.status || !schema.assignee) return

    const initialStatus = getTaskStatusForCompletion(sourcePayload, false)
    const initialValues = [
      ...(currentUserId
        ? [
            {
              propertyId: schema.assignee.property.id,
              value: [currentUserId],
            },
          ]
        : []),
      ...(initialStatus
        ? [{ propertyId: schema.status.property.id, value: initialStatus }]
        : []),
    ]
    const existingRowIds = new Set(sourcePayload.rows.map((row) => row.id))

    addRow.mutate(
      {
        databaseId: sourcePayload.database.id,
        optimisticValues: initialValues,
      },
      {
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : "Could not create task."
          ),
        onSuccess: (nextPayload) => {
          const addedRow = nextPayload.rows.find(
            (row) => !existingRowIds.has(row.id)
          )
          if (!addedRow) {
            toast.error(
              "The task was created, but its fields could not be updated."
            )
            return
          }

          for (const propertyValue of initialValues) {
            updateValue.mutate(
              {
                databaseId: sourcePayload.database.id,
                propertyId: propertyValue.propertyId,
                rowId: addedRow.id,
                value: propertyValue.value,
              },
              {
                onError: (error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not update the task."
                  ),
              }
            )
          }
        },
      }
    )
  }

  return (
    <DatabaseViewProvider
      value={{
        ...viewModel,
        activeViewTabId: activeViewId,
        addDataSource: () => setDataSourceSetupOpen(true),
        addChartView: () => {},
        addDatabaseProperty: () => {},
        addDatabaseRow: createTask,
        addDraggedPageRow: () => {},
        addFormView: () => {},
        addGalleryView: () => {},
        addKanbanView: () => {},
        linkDataSourceView: () => {},
        addListView: () => {},
        addTableView: () => {},
        addTimelineRow: () => {},
        addTimelineView: () => {},
        canAddDatabaseProperties: false,
        canAddDatabaseRows: payloads.length > 0,
        canAddDatabaseViews: false,
        clearDatabaseFilter: () => saveDatabaseFilters([]),
        clearDatabaseSort: () => void saveDatabaseSorts([]),
        configureDataSources: onConfigureDataSources,
        copyDatabaseViewLink: () => {
          void navigator.clipboard?.writeText(window.location.href)
          toast.success("Task view link copied.")
        },
        createDatabaseFilter: (propertyId) => {
          const propertyType = getPropertyType(propertyId)
          saveDatabaseFilters([
            ...plainFilters(),
            {
              id: createFilterId(),
              operator:
                getDatabaseFilterOperatorsForType(propertyType)[0]?.value ??
                "is",
              propertyId,
              values: [],
            },
          ])
          setFilterPickerOpen(false)
          setShowFilterPill(true)
        },
        createDatabaseSort: (column) => {
          void saveDatabaseSorts([
            ...viewModel.activeDatabaseSorts.map(({ column, direction }) => ({
              column,
              direction,
            })),
            { column, direction: "ascending" },
          ])
          setSortPickerOpen(false)
          setShowSortPill(true)
        },
        dataSources: payloads.flatMap((source) =>
          source.activeDataSource
            ? [
                {
                  config: source.activeDataSource.config,
                  id: source.activeDataSource.id,
                  name: source.activeDataSource.name || "Untitled data source",
                  parentDatabaseId: source.activeDataSource.parentDatabaseId,
                  viewCount: source.views.filter(
                    (view) => view.dataSourceId === source.activeDataSource!.id,
                  ).length,
                },
              ]
            : [],
        ),
        databaseConfig: payload.activeDataSource?.config,
        databaseId: payloads.length > 0 ? TASKS_DATA_SOURCE_ID : null,
        databaseName: "My Tasks",
        databaseWorkspaceId: workspaceId ?? undefined,
        deleteDatabaseView: () => {},
        draftDatabaseTitle: "My Tasks",
        draftViewTitle: "My Tasks",
        duplicateDatabaseView: () => {},
        editable: true,
        fetchNextPage: emptyAsync,
        filterPickerOpen,
        fullPage: true,
        getDatabasePageDragPayload: () => null,
        hasDatabasePageDragPayload: () => false,
        hasNextPage: false,
        headerMenusEnabled: true,
        hostDatabaseId: TASKS_DATABASE_ID,
        hostDatabaseName: "My Tasks",
        hostDatabaseWorkspaceId: workspaceId ?? undefined,
        hostViews: payload.views,
        isAddingDatabaseProperty: false,
        isAddingDatabaseRow: addRow.isPending,
        isAddingDataSource,
        isAddingDatabaseView: false,
        isFetchingNextPage: false,
        isRowComplete: (row) =>
          rowsBySyntheticId.get(row.id)?.isCompleted ?? false,
        newRowLabel: "New task",
        onOpenPage: (pageId) => {
          if (pageId.startsWith("task-source:")) {
            void navigate({
              params: { databaseId: pageId.slice("task-source:".length) },
              search: { view: undefined },
              to: "/d/$databaseId",
            })
            return
          }
          void navigate({ params: { pageId }, to: "/p/$pageId" })
        },
        onShowTitleChange: undefined,
        options: viewModel.kanbanOptions,
        realtimeEnabled: false,
        removeDatabaseFilter: (index) =>
          saveDatabaseFilters(
            plainFilters().filter((_, filterIndex) => filterIndex !== index)
          ),
        removeDatabaseSort: (index) =>
          void saveDatabaseSorts(
            viewModel.activeDatabaseSorts.flatMap(
              ({ column, direction }, sortIndex) =>
                sortIndex === index ? [] : [{ column, direction }]
            )
          ),
        renameDatabaseProperty: () => {},
        reorderDatabaseFilters: (filterIds) => {
          const filters = plainFilters()
          const byId = new Map(filters.map((filter) => [filter.id, filter]))
          saveDatabaseFilters([
            ...filterIds.flatMap((id) => {
              const filter = byId.get(id)
              return filter ? [filter] : []
            }),
            ...filters.filter((filter) => !filterIds.includes(filter.id)),
          ])
        },
        saveDatabaseConditionalColors: (
          conditionalColors: DatabaseConditionalColorConfig[]
        ) =>
          updateViewConfig({
            conditionalColors:
              conditionalColors.length > 0 ? conditionalColors : undefined,
          }),
        saveDatabaseEmoji: () => {},
        saveDatabaseFilters,
        saveDatabasePropertyOrder: (propertyOrder) =>
          updateViewConfig({ propertyOrder }),
        saveDatabaseSorts,
        saveDatabaseTitle: () => {},
        saveDatabaseViewIcon: () => {},
        saveDatabaseViewTitle: () => {},
        savePropertyValue,
        setActiveViewId,
        setDraftDatabaseTitle: () => {},
        setDraftViewTitle: () => {},
        setFilterPickerOpen,
        setRowComplete: (row, complete) => {
          const task = rowsBySyntheticId.get(row.id)
          const sourcePayload = task
            ? sourcePayloadById.get(task.databaseId)
            : null
          const statusProperty = sourcePayload
            ? getTaskDatabaseSchema(sourcePayload).status
            : null
          const nextStatus = sourcePayload
            ? getTaskStatusForCompletion(sourcePayload, complete)
            : null

          if (!task || !statusProperty || !nextStatus) {
            toast.error(
              complete
                ? "This database needs a status in the Complete group."
                : "This database needs a non-complete default status."
            )
            return
          }

          updateValue.mutate(
            {
              databaseId: task.databaseId,
              propertyId: statusProperty.property.id,
              rowId: task.rowId,
              value: nextStatus,
            },
            {
              onError: (error) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not update the task."
                ),
            }
          )
        },
        setSortPickerOpen,
        setViewDateProperty: () => {},
        setViewGroupProperty: (groupPropertyId) =>
          updateViewConfig({ groupPropertyId: groupPropertyId ?? undefined }),
        setViewType: () => {},
        setupTimelineDateProperty: () => {},
        showExpandButton: false,
        showFilterPill,
        showPropertyTitles,
        showSortPill,
        showTitle: false,
        sortPickerOpen,
        toggleFilterPillVisibility: () =>
          setShowFilterPill((current) => !current),
        togglePropertyTitles: () =>
          setShowPropertyTitles((current) => !current),
        togglePropertyVisibility: (propertyId) => {
          const hidden = new Set(
            payload.properties
              .filter(
                (property) => !viewModel.visibleProperties.includes(property)
              )
              .map((property) => property.id)
          )
          if (hidden.has(propertyId)) hidden.delete(propertyId)
          else hidden.add(propertyId)
          updateViewConfig({ hiddenPropertyIds: [...hidden] })
        },
        toggleSortPillVisibility: () => setShowSortPill((current) => !current),
        updateDatabaseChartSettings: (chart) => updateViewConfig({ chart }),
        updateDatabaseFilter,
        updateDatabaseLayoutSettings: (layout) => updateViewConfig({ layout }),
        updateDatabasePropertyConfig,
        updateDatabaseSort,
        updateDatabaseSubItemsSettings: (
          subItems: Partial<DatabaseSubItemsSettings>
        ) =>
          updateViewConfig({
            subItems: { ...viewModel.subItemsSettings, ...subItems },
          }),
        updateNameColumnConfig: (config) =>
          setDatabaseConfig((current: unknown) =>
            getMergedNameColumnConfig(current, config)
          ),
        viewTabs: [
          {
            dataSourceId: TASKS_DATA_SOURCE_ID,
            id: TASKS_VIEW_ID,
            name: "My Tasks",
            sourceParentDatabaseId: TASKS_DATABASE_ID,
            type: "list",
          },
        ],
        views: payload.views,
        workspaceId,
      }}
    >
      <div className="database-block-shell database-block-shell-full">
        <div className="database-toolbar-section">
          <DatabaseViewToolbar />
        </div>
        <div className="database-scroll-section">
          {isLoading ? (
            <DatabaseViewSkeleton viewType="list" />
          ) : (
            <DatabaseListView />
          )}
          {dataSourceSetupOpen && payloads[0] ? (
            <DatabaseSetupCard
              databaseId={payloads[0].database.id}
              excludedDatabaseIds={payloads.map((source) => source.database.id)}
              onComplete={() => setDataSourceSetupOpen(false)}
              onDismiss={() => setDataSourceSetupOpen(false)}
              onSelectDataSource={onSelectDataSource}
              workspaceId={workspaceId}
            />
          ) : null}
        </div>
      </div>
    </DatabaseViewProvider>
  )
}

function buildTasksPayload({
  databaseConfig,
  propertyConfigs,
  rows,
  sourcePayloads,
  viewConfig,
  workspaceId,
}: {
  databaseConfig: unknown
  propertyConfigs: Record<string, unknown>
  rows: TaskRow[]
  sourcePayloads: DatabasePayload[]
  viewConfig: unknown
  workspaceId: string | null | undefined
}): DatabasePayload {
  const statusOptions = Array.from(
    new Map(
      sourcePayloads
        .flatMap((source) => {
          const status = getTaskDatabaseSchema(source).status
          return status ? getSelectOptions(status.property.config) : []
        })
        .map((option) => [option.name, option])
    ).values()
  )
  const sourceSummaries = Object.fromEntries(
    sourcePayloads.map((source) => {
      const emoji = getDatabaseEmoji({ config: source.database.dataSourceConfig })
      return [
        `task-source:${source.database.id}`,
        {
          iconKind: "database",
          id: `task-source:${source.database.id}`,
          metadata: emoji ? { emoji } : null,
          name: source.database.name || "Untitled database",
        },
      ]
    })
  )
  const propertyDefinitions = [
    {
      config: { options: statusOptions },
      databasePropertyId: STATUS_COLUMN_ID,
      id: STATUS_PROPERTY_ID,
      name: "Status",
      type: "status",
      width: 170,
    },
    {
      config: undefined,
      databasePropertyId: ASSIGNEE_COLUMN_ID,
      id: ASSIGNEE_PROPERTY_ID,
      name: "Assignee",
      type: "person",
      width: 190,
    },
    {
      config: undefined,
      databasePropertyId: DUE_DATE_COLUMN_ID,
      id: DUE_DATE_PROPERTY_ID,
      name: "Due date",
      type: "date",
      width: 160,
    },
    {
      config: {
        pageSummaries: sourceSummaries,
        relation: { limit: "one_page" },
      },
      databasePropertyId: SOURCE_COLUMN_ID,
      id: SOURCE_PROPERTY_ID,
      name: "Source",
      type: "relation",
      width: 210,
    },
  ] as const
  const properties: DatabaseProperty[] = propertyDefinitions.map(
    (definition, position) => ({
      createdAt: "",
      dataSourceId: TASKS_DATA_SOURCE_ID,
      id: definition.databasePropertyId,
      position,
      property: {
        config: getMergedPropertyConfig(
          definition.config,
          propertyConfigs[
            definition.databasePropertyId
          ] as DatabasePropertyConfig
        ),
        createdAt: "",
        id: definition.id,
        name: definition.name,
        type: definition.type,
        updatedAt: "",
        workspaceId: workspaceId ?? TASKS_DATABASE_ID,
      },
      propertyId: definition.id,
      updatedAt: "",
      visible: true,
      width: definition.width,
    })
  )
  const values: PagePropertyValue[] = rows.flatMap((row) => [
    makeValue(row, STATUS_PROPERTY_ID, row.status),
    makeValue(row, ASSIGNEE_PROPERTY_ID, row.assigneeIds),
    makeValue(row, DUE_DATE_PROPERTY_ID, row.dueDate),
    makeValue(row, SOURCE_PROPERTY_ID, [`task-source:${row.databaseId}`]),
  ])
  const views: DatabaseView[] = [
    {
      config: viewConfig,
      createdAt: "",
      databaseId: TASKS_DATABASE_ID,
      dataSourceId: TASKS_DATA_SOURCE_ID,
      id: TASKS_VIEW_ID,
      name: "My Tasks",
      position: 0,
      type: "list",
      updatedAt: "",
    },
  ]

  return {
    activeDataSource: {
      config: databaseConfig,
      configVersion: 1,
      createdAt: "",
      id: TASKS_DATA_SOURCE_ID,
      name: "My Tasks",
      parentDatabaseId: TASKS_DATABASE_ID,
      updatedAt: "",
      version: 0,
      workspaceId: workspaceId ?? TASKS_DATABASE_ID,
    },
    dataSources: [
      {
        config: databaseConfig,
        configVersion: 1,
        createdAt: "",
        id: TASKS_DATA_SOURCE_ID,
        name: "My Tasks",
        parentDatabaseId: TASKS_DATABASE_ID,
        updatedAt: "",
        version: 0,
        workspaceId: workspaceId ?? TASKS_DATABASE_ID,
      },
    ],
    database: {
      config: databaseConfig,
      createdAt: "",
      id: TASKS_DATABASE_ID,
      name: "My Tasks",
      pageId: null,
      updatedAt: "",
      version: 0,
      workspaceId: workspaceId ?? TASKS_DATABASE_ID,
    },
    properties,
    rows: rows.map((row, position) => ({
      createdAt: row.createdAt,
      dataSourceId: TASKS_DATA_SOURCE_ID,
      id: getSyntheticRowId(row),
      page: {
        createdAt: row.createdAt,
        id: row.pageId,
        metadata: row.pageMetadata,
        name: row.title,
        updatedAt: row.updatedAt,
      },
      pageId: row.pageId,
      position,
      updatedAt: row.updatedAt,
    })),
    values,
    views,
  }
}

function makeValue(
  row: TaskRow,
  propertyId: string,
  value: unknown
): PagePropertyValue {
  return {
    createdAt: row.createdAt,
    id: `${getSyntheticRowId(row)}:${propertyId}`,
    pageId: row.pageId,
    propertyId,
    updatedAt: row.updatedAt,
    value,
  }
}

function getSyntheticRowId(row: TaskRow) {
  return `${row.databaseId}:${row.rowId}`
}

function TasksEmptyState({
  creating,
  onConfigure,
  onCreateDatabase,
}: {
  creating: boolean
  onConfigure: () => void
  onCreateDatabase: () => Promise<void>
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed px-6 py-16 text-center">
      <CheckCircle2Icon className="mx-auto size-10 text-muted-foreground" />
      <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground">
        Connect an existing database with Status, Assignee, and Due date
        properties, or create one that is ready to use.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={onConfigure} type="button" variant="outline">
          <Settings2Icon />
          Connect databases
        </Button>
        <Button
          disabled={creating}
          onClick={() => void onCreateDatabase()}
          type="button"
        >
          {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Create Tasks database
        </Button>
      </div>
    </div>
  )
}

function DatabaseWarnings({ payloads }: { payloads: DatabasePayload[] }) {
  const warnings = payloads.flatMap((payload) => {
    const missing = getTaskDatabaseSchema(payload).missing
    return missing.length ? [{ missing, payload }] : []
  })
  if (warnings.length === 0) return null

  return (
    <div className="mb-4 space-y-2">
      {warnings.map(({ missing, payload }) => (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-status-warning-surface px-3 py-2 text-sm text-status-warning-surface-foreground"
          key={payload.database.id}
        >
          <span className="font-medium">{payload.database.name}</span>
          <span>needs {missing.join(", ")}.</span>
          <Button asChild className="ml-auto" size="sm" variant="ghost">
            <Link
              params={{ databaseId: payload.database.id }}
              search={{ view: undefined }}
              to="/d/$databaseId"
            >
              Open database
            </Link>
          </Button>
        </div>
      ))}
    </div>
  )
}

function ConfigureTaskDatabasesDialog({
  databases,
  onOpenChange,
  onSave,
  open,
  selectedDatabaseIds,
}: {
  databases: Array<{ id: string; name: string }>
  onOpenChange: (open: boolean) => void
  onSave: (databaseIds: string[]) => Promise<void>
  open: boolean
  selectedDatabaseIds: string[]
}) {
  const [draft, setDraft] = useState(selectedDatabaseIds)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setDraft(selectedDatabaseIds)
  }, [open, selectedDatabaseIds])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure My Tasks</DialogTitle>
          <DialogDescription>
            Connect up to 10 databases. Each needs Status, Assignee (person),
            and Due date properties.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto py-1">
          {databases.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No databases are available in this workspace.
            </p>
          ) : (
            databases.map((database) => {
              const checked = draft.includes(database.id)
              return (
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent has-disabled:cursor-not-allowed has-disabled:opacity-60"
                  key={database.id}
                >
                  <Checkbox
                    checked={checked}
                    disabled={!checked && draft.length >= 10}
                    onCheckedChange={(nextChecked) =>
                      setDraft((current) =>
                        nextChecked === true
                          ? [...current, database.id].slice(0, 10)
                          : current.filter((id) => id !== database.id)
                      )
                    }
                  />
                  <DatabaseIcon className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {database.name || "Untitled database"}
                  </span>
                </label>
              )
            })
          )}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {draft.length} of 10 connected
          </span>
          <div className="flex gap-2">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                try {
                  await onSave(draft)
                  onOpenChange(false)
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not save task databases."
                  )
                } finally {
                  setSaving(false)
                }
              }}
              type="button"
            >
              {saving ? <Loader2Icon className="animate-spin" /> : null}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

async function createTaskDatabase({
  applyTemplate,
  createDatabase,
  saveTaskDatabaseIds,
  selection,
  selectedDatabaseIds,
  workspaceId,
}: {
  applyTemplate: ReturnType<typeof useApplyDatabaseTemplate>
  createDatabase: ReturnType<typeof useCreateDatabase>
  saveTaskDatabaseIds: (databaseIds: string[]) => Promise<void>
  selection: DatabaseSetupSelection
  selectedDatabaseIds: string[]
  workspaceId: string | null | undefined
}) {
  if (!workspaceId) throw new Error("Choose a workspace first.")

  if (selection.sourceView) {
    if (selectedDatabaseIds.includes(selection.sourceView.parentDatabaseId)) {
      toast.message("That data source is already connected.")
      return
    }

    await saveTaskDatabaseIds(
      [...selectedDatabaseIds, selection.sourceView.parentDatabaseId].slice(0, 10)
    )
    toast.success("Data source linked.")
    return
  }

  const template = selection.templateId
    ? getDatabaseSetupTemplate(selection.templateId)
    : null
  const name = selection.databaseName || template?.name || "New data source"
  const payload = await createDatabase.mutateAsync({
    name,
    standalone: true,
    workspaceId,
  })
  const requiredProperties = [
    {
      config: {
        defaultOptionId: defaultStatusOptions[0]?.id,
        options: defaultStatusOptions,
      },
      name: "Status",
      type: "status",
    },
    {
      config: { personLimit: "one_person" },
      name: "Assignee",
      type: "person",
    },
    { name: "Due date", type: "date" },
  ]
  const templateProperties = template?.properties ?? []
  const templatePropertyTypes = new Set(
    templateProperties.map((property) => property.type)
  )
  const properties = [
    ...templateProperties,
    ...requiredProperties.filter(
      (property) => !templatePropertyTypes.has(property.type)
    ),
  ]
  const propertyTypesByName = new Map(
    properties.map((property) => [property.name.toLowerCase(), property.type])
  )

  await applyTemplate.mutateAsync({
    config: getMergedDatabaseConfig(payload.database.config, {
      emoji: template?.emoji ?? "✅",
      setupDismissed: true,
    }),
    databaseId: payload.database.id,
    name,
    properties,
    rows: (template?.sampleRows ?? []).map((sampleRow) => ({
      content: createSampleRowContent(sampleRow.content),
      metadata: { emoji: sampleRow.emoji },
      title: sampleRow.title,
      values: Object.entries(sampleRow.values ?? {}).flatMap(
        ([propertyName, value]) => {
          const propertyType = propertyTypesByName.get(
            propertyName.toLowerCase()
          )

          return propertyType
            ? [
                {
                  propertyName,
                  value: serializePropertyValue(propertyType, value),
                },
              ]
            : []
        }
      ),
    })),
  })
  await saveTaskDatabaseIds(
    [...selectedDatabaseIds, payload.database.id].slice(0, 10)
  )
  toast.success("Data source created and connected.")
}

function createFilterId() {
  return `filter-${crypto.randomUUID()}`
}
