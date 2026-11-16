import {
  CheckCircle2Icon,
  DatabaseIcon,
  Loader2Icon,
  PlusIcon,
  Settings2Icon,
} from "@/components/icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { useZilobaseFeatures, type ClientOperationContext } from "@zilobase/features";
import {
  ASSIGNEE_COLUMN_ID,
  createTaskDatabase as createSharedTaskDatabase,
  buildTasksViewData as deriveTasksViewData,
  DUE_DATE_COLUMN_ID,
  getSyntheticRowId,
  SOURCE_COLUMN_ID,
  STATUS_COLUMN_ID,
  TASKS_DATA_SOURCE_ID,
  TASKS_DATABASE_ID,
  TASKS_VIEW_ID,
} from "@zilobase/features/tasks";
import { useTaskDatabases } from "@zilobase/features/tasks/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type DatabaseSetupSelection } from "@/sections/databases/setup/components/database-setup-card";
import { getDatabaseViewModel } from "@/sections/databases/views/shared/components/database-view-model";
import { DatabaseViewSkeleton } from "@/sections/databases/views/shared/components/database-view-skeleton";
import { useSession } from "@zilobase/features/auth/react";
import type {
  DatabaseFilterUpdatePatch,
  DatabaseSortUpdatePatch,
  DatabaseViewData,
} from "@zilobase/features/databases";
import {
  getDatabaseFilterOperatorsForType,
  getMergedDatabaseConfig,
  getMergedNameColumnConfig,
  getMergedPropertyConfig,
  getValidDatabaseFilterOperator,
  type DatabaseConditionalColorConfig,
  type DatabaseExportPayload,
  type DatabaseFilterItemConfig,
  type DatabasePropertyConfig,
  type DatabasePropertyValue,
  type DatabaseSortConfig,
  type DatabaseSubItemsSettings,
} from "@zilobase/features/databases";
import {
  useAddDatabaseRow,
  useApplyDatabaseTemplate,
  useCreateDatabase,
  useUpdateDatabasePropertyValue,
} from "@zilobase/features/databases/react";
import { usePageNavigation } from "@zilobase/features/pages/react";
import {
  buildTaskRows,
  filterMyTaskRows,
  getTaskCompletionUpdate,
  getTaskCreationInput,
  getTaskDatabaseSchema,
  getTaskPropertyUpdate,
  type TaskRow,
} from "@zilobase/features/tasks";
import {
  defaultUserSettings,
  normalizeSidebarConfig,
  resolveSidebarWorkspaceLayout,
  withSidebarWorkspaceLayout,
} from "@zilobase/features/user-settings";
import { useUpdateUserSettings, useUserSettings } from "@zilobase/features/user-settings/react";
import {
  useActiveWorkspaceId,
  useWorkspaceAccessTargets,
} from "@zilobase/features/workspaces/react";
import { TaskDatabaseListAdapter } from "./components/task-database-list-adapter";

const DatabaseListView = lazy(() =>
  import("@/sections/databases/views/list/components/database-list-view").then((module) => ({
    default: module.DatabaseListView,
  })),
);
const DatabaseSetupCard = lazy(() =>
  import("@/sections/databases/setup/components/database-setup-card").then((module) => ({
    default: module.DatabaseSetupCard,
  })),
);
const DatabaseViewToolbar = lazy(() =>
  import("@/sections/databases/views/shared/components/database-view-toolbar").then((module) => ({
    default: module.DatabaseViewToolbar,
  })),
);

const emptyAsync = async () => undefined;

export default function TasksScreen() {
  const operationContext = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  const { data: session } = useSession();
  const { data: navigation, isLoading: navigationLoading } = usePageNavigation(workspaceId);
  const { data: userSettings = defaultUserSettings } = useUserSettings();
  const { data: accessTargets } = useWorkspaceAccessTargets(workspaceId);
  const updateUserSettings = useUpdateUserSettings();
  const createDatabase = useCreateDatabase();
  const applyTemplate = useApplyDatabaseTemplate();
  const sidebarConfig = useMemo(
    () => normalizeSidebarConfig(userSettings.sidebarConfig),
    [userSettings.sidebarConfig],
  );
  const sidebarLayout = useMemo(
    () => resolveSidebarWorkspaceLayout(sidebarConfig, workspaceId),
    [sidebarConfig, workspaceId],
  );
  const selectedDatabaseIds = sidebarLayout.taskDatabaseIds;
  const { payloads, isLoading: databasesLoading } = useTaskDatabases(selectedDatabaseIds);
  const isLoading = navigationLoading || databasesLoading;
  const eligiblePayloads = payloads.filter(
    (payload) => getTaskDatabaseSchema(payload).missing.length === 0,
  );
  const allRows = useMemo(() => buildTaskRows(eligiblePayloads), [eligiblePayloads]);
  const currentUserId = session?.user?.id ?? null;
  const myRows = filterMyTaskRows(allRows, currentUserId);
  const [configurationOpen, setConfigurationOpen] = useState(false);

  const saveTaskDatabaseIds = async (taskDatabaseIds: string[]) => {
    if (!workspaceId) return;
    await updateUserSettings.mutateAsync({
      sidebarConfig: withSidebarWorkspaceLayout(sidebarConfig, workspaceId, {
        ...sidebarLayout,
        taskDatabaseIds,
      }),
    });
  };

  const selectTaskDataSource = async (selection: DatabaseSetupSelection) => {
    try {
      await createTaskDatabase(operationContext, {
        saveTaskDatabaseIds,
        selection,
        selectedDatabaseIds,
        workspaceId,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the task database.");
    }
  };
  const addTaskDataSource = () =>
    selectTaskDataSource({
      databaseName: "Tasks Tracker",
      templateId: "tasks-tracker",
    });

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-surface-canvas">
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
                isAddingDataSource={createDatabase.isPending || applyTemplate.isPending}
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
  );
}

function TasksPageHeader() {
  return (
    <div className="relative px-5 pb-0 pt-1 sm:px-8 md:px-20 lg:px-24">
      <div className="relative mb-1 min-h-8" />
      <div className="flex items-start gap-3">
        <h1 className="min-h-8 min-w-0 flex-1 px-3 py-0 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-balance text-content-primary">
          My Tasks
        </h1>
      </div>
    </div>
  );
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
  accessTargets: { members: Array<{ email: string; id: string; name: string }> } | undefined;
  currentUserId: string | null;
  isLoading: boolean;
  isAddingDataSource: boolean;
  onConfigureDataSources: () => void;
  onSelectDataSource: (selection: DatabaseSetupSelection) => Promise<void>;
  payloads: DatabaseExportPayload[];
  rows: TaskRow[];
  workspaceId: string | null | undefined;
}) {
  const navigate = useNavigate();
  const updateValue = useUpdateDatabasePropertyValue();
  const addRow = useAddDatabaseRow();
  const [dataSourceSetupOpen, setDataSourceSetupOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(TASKS_VIEW_ID);
  const [databaseConfig, setDatabaseConfig] = useState<unknown>({
    nameColumn: { label: "Task", showPageIcon: true },
  });
  const [propertyConfigs, setPropertyConfigs] = useState<Record<string, unknown>>({});
  const [viewConfig, setViewConfig] = useState<unknown>({
    sorts: [{ column: DUE_DATE_COLUMN_ID, direction: "ascending" }],
  });
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [sortPickerOpen, setSortPickerOpen] = useState(false);
  const [showFilterPill, setShowFilterPill] = useState(false);
  const [showSortPill, setShowSortPill] = useState(false);
  const [showPropertyTitles, setShowPropertyTitles] = useState(false);
  const viewData = useMemo(
    () =>
      buildTasksViewData({
        databaseConfig,
        propertyConfigs,
        rows,
        sourcePayloads: payloads,
        viewConfig,
        workspaceId,
      }),
    [databaseConfig, payloads, propertyConfigs, rows, viewConfig, workspaceId],
  );
  const taskProperties = viewData.bootstrap.properties;
  const viewModel = useMemo(
    () =>
      getDatabaseViewModel({
        accessTargets,
        activeViewId,
        currentUserId: currentUserId ?? undefined,
        viewData,
      }),
    [accessTargets, activeViewId, currentUserId, viewData],
  );
  const rowsBySyntheticId = useMemo(
    () => new Map(rows.map((row) => [getSyntheticRowId(row), row])),
    [rows],
  );
  const sourcePayloadById = useMemo(
    () => new Map(payloads.map((source) => [source.database.id, source])),
    [payloads],
  );
  const updateViewConfig = (patch: Record<string, unknown>) => {
    setViewConfig((current: unknown) => getMergedDatabaseConfig(current, patch));
  };
  const saveDatabaseSorts = async (sorts: DatabaseSortConfig[]) => {
    updateViewConfig({ sorts: sorts.length > 0 ? sorts : undefined });
  };
  const saveDatabaseFilters = (filters: DatabaseFilterItemConfig[]) => {
    updateViewConfig({ filters: filters.length > 0 ? filters : undefined });
  };
  const plainFilters = () =>
    viewModel.activeDatabaseFilters.map(({ id, operator, propertyId, values }) => ({
      id,
      operator,
      propertyId,
      values,
    }));
  const getPropertyType = (propertyId: string) =>
    propertyId === "name"
      ? "text"
      : (taskProperties.find((property) => property.id === propertyId)?.property.type ?? "text");
  const savePropertyValue = (
    rowId: string,
    propertyId: string,
    _propertyType: string,
    _currentValue: DatabasePropertyValue,
    nextValue: DatabasePropertyValue,
  ) => {
    const task = rowsBySyntheticId.get(rowId);
    const sourcePayload = task ? sourcePayloadById.get(task.databaseId) : null;
    const update = getTaskPropertyUpdate(task, sourcePayload, propertyId, nextValue);
    if (!update) return;
    updateValue.mutate(update, {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Could not update task."),
    });
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
  const updateDatabaseFilter = (index: number, patch: DatabaseFilterUpdatePatch) => {
    saveDatabaseFilters(
      plainFilters().map((filter, filterIndex) => {
        if (filterIndex !== index) return filter;
        const propertyId = patch.propertyId ?? filter.propertyId;
        const propertyType = getPropertyType(propertyId);
        return {
          ...filter,
          operator: patch.operator
            ? getValidDatabaseFilterOperator(patch.operator, propertyType)
            : filter.operator,
          propertyId,
          values: patch.values ?? (propertyId === filter.propertyId ? filter.values : []),
        };
      }),
    );
  };
  const updateDatabaseSort = (index: number, patch: DatabaseSortUpdatePatch) => {
    void saveDatabaseSorts(
      viewModel.activeDatabaseSorts.map(({ column, direction }, sortIndex) =>
        sortIndex === index ? { column, direction, ...patch } : { column, direction },
      ),
    );
  };
  const createTask = () => {
    const sourcePayload = payloads[0];
    if (!sourcePayload || addRow.isPending) return;

    const input = getTaskCreationInput(sourcePayload, currentUserId);
    if (!input) return;
    addRow.mutate(input, {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Could not create task."),
    });
  };

  return (
    <TaskDatabaseListAdapter
      value={{
        ...viewModel,
        activeViewTabId: activeViewId,
        addDataSource: () => setDataSourceSetupOpen(true),
        addDatabaseRow: createTask,
        canAddDatabaseProperties: false,
        canAddDatabaseRows: payloads.length > 0,
        canAddDatabaseViews: false,
        clearDatabaseFilter: () => saveDatabaseFilters([]),
        clearDatabaseSort: () => void saveDatabaseSorts([]),
        configureDataSources: onConfigureDataSources,
        copyDatabaseViewLink: () => {
          void navigator.clipboard?.writeText(window.location.href);
          toast.success("Task view link copied.");
        },
        createDatabaseFilter: (propertyId) => {
          const propertyType = getPropertyType(propertyId);
          saveDatabaseFilters([
            ...plainFilters(),
            {
              id: createFilterId(),
              operator: getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is",
              propertyId,
              values: [],
            },
          ]);
          setFilterPickerOpen(false);
          setShowFilterPill(true);
        },
        createDatabaseSort: (column) => {
          void saveDatabaseSorts([
            ...viewModel.activeDatabaseSorts.map(({ column, direction }) => ({
              column,
              direction,
            })),
            { column, direction: "ascending" },
          ]);
          setSortPickerOpen(false);
          setShowSortPill(true);
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
        databaseConfig: viewData.activeDataSource?.config,
        databaseId: payloads.length > 0 ? TASKS_DATA_SOURCE_ID : null,
        databaseName: "My Tasks",
        databaseWorkspaceId: workspaceId ?? undefined,
        draftDatabaseTitle: "My Tasks",
        draftViewTitle: "My Tasks",
        editable: true,
        fetchNextPage: emptyAsync,
        filterPickerOpen,
        fullPage: true,
        hasNextPage: false,
        headerMenusEnabled: true,
        hostDatabaseId: TASKS_DATABASE_ID,
        hostDatabaseName: "My Tasks",
        hostDatabaseWorkspaceId: workspaceId ?? undefined,
        hostViews: viewData.bootstrap.views,
        isAddingDatabaseProperty: false,
        isAddingDatabaseRow: addRow.isPending,
        isAddingDataSource,
        isAddingDatabaseView: false,
        isFetchingNextPage: false,
        isRowComplete: (row) => rowsBySyntheticId.get(row.id)?.isCompleted ?? false,
        newRowLabel: "New task",
        onOpenPage: (pageId) => {
          if (pageId.startsWith("task-source:")) {
            void navigate({
              params: { databaseId: pageId.slice("task-source:".length) },
              search: { view: undefined },
              to: "/d/$databaseId",
            });
            return;
          }
          void navigate({ params: { pageId }, to: "/p/$pageId" });
        },
        onShowTitleChange: undefined,
        options: viewModel.kanbanOptions,
        realtimeEnabled: false,
        prefetchDatabaseView: () => {},
        removeDatabaseFilter: (index) =>
          saveDatabaseFilters(plainFilters().filter((_, filterIndex) => filterIndex !== index)),
        removeDatabaseSort: (index) =>
          void saveDatabaseSorts(
            viewModel.activeDatabaseSorts.flatMap(({ column, direction }, sortIndex) =>
              sortIndex === index ? [] : [{ column, direction }],
            ),
          ),
        reorderDatabaseFilters: (filterIds) => {
          const filters = plainFilters();
          const byId = new Map(filters.map((filter) => [filter.id, filter]));
          saveDatabaseFilters([
            ...filterIds.flatMap((id) => {
              const filter = byId.get(id);
              return filter ? [filter] : [];
            }),
            ...filters.filter((filter) => !filterIds.includes(filter.id)),
          ]);
        },
        saveDatabaseConditionalColors: (conditionalColors: DatabaseConditionalColorConfig[]) =>
          updateViewConfig({
            conditionalColors: conditionalColors.length > 0 ? conditionalColors : undefined,
          }),
        saveDatabaseFilters,
        saveDatabasePropertyOrder: (propertyOrder) => updateViewConfig({ propertyOrder }),
        saveDatabaseSorts,
        savePropertyValue,
        setActiveViewId,
        setFilterPickerOpen,
        setRowComplete: (row, complete) => {
          const task = rowsBySyntheticId.get(row.id);
          const sourcePayload = task ? sourcePayloadById.get(task.databaseId) : null;
          const update = getTaskCompletionUpdate(task, sourcePayload, complete);
          if (!update) {
            toast.error(
              complete
                ? "This database needs a status in the Complete group."
                : "This database needs a non-complete default status.",
            );
            return;
          }

          updateValue.mutate(update, {
            onError: (error) =>
              toast.error(error instanceof Error ? error.message : "Could not update the task."),
          });
        },
        setSortPickerOpen,
        setViewGroupProperty: (groupPropertyId) =>
          updateViewConfig({ groupPropertyId: groupPropertyId ?? undefined }),
        showExpandButton: false,
        showFilterPill,
        showPropertyTitles,
        showSortPill,
        showTitle: false,
        sortPickerOpen,
        toggleFilterPillVisibility: () => setShowFilterPill((current) => !current),
        togglePropertyTitles: () => setShowPropertyTitles((current) => !current),
        togglePropertyVisibility: (propertyId) => {
          const hidden = new Set(
            taskProperties
              .filter((property) => !viewModel.visibleProperties.includes(property))
              .map((property) => property.id),
          );
          if (hidden.has(propertyId)) hidden.delete(propertyId);
          else hidden.add(propertyId);
          updateViewConfig({ hiddenPropertyIds: [...hidden] });
        },
        toggleSortPillVisibility: () => setShowSortPill((current) => !current),
        updateDatabaseChartSettings: (chart) => updateViewConfig({ chart }),
        updateDatabaseFilter,
        updateDatabaseLayoutSettings: (layout) => updateViewConfig({ layout }),
        updateDatabasePropertyConfig,
        updateDatabaseSort,
        updateDatabaseSubItemsSettings: (subItems: Partial<DatabaseSubItemsSettings>) =>
          updateViewConfig({
            subItems: { ...viewModel.subItemsSettings, ...subItems },
          }),
        updateNameColumnConfig: (config) =>
          setDatabaseConfig((current: unknown) => getMergedNameColumnConfig(current, config)),
        viewTabs: [
          {
            dataSourceId: TASKS_DATA_SOURCE_ID,
            id: TASKS_VIEW_ID,
            name: "My Tasks",
            sourceParentDatabaseId: TASKS_DATABASE_ID,
            type: "list",
          },
        ],
        views: viewData.bootstrap.views,
        workspaceId,
      }}
    >
      <div className="database-block-shell database-block-shell-full">
        <Suspense fallback={<DatabaseViewSkeleton viewType="list" />}>
          <div className="database-toolbar-section">
            <DatabaseViewToolbar />
          </div>
          <div className="database-scroll-section">
            {isLoading ? <DatabaseViewSkeleton viewType="list" /> : <DatabaseListView />}
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
        </Suspense>
      </div>
    </TaskDatabaseListAdapter>
  );
}

function buildTasksViewData(input: Parameters<typeof deriveTasksViewData>[0]): DatabaseViewData {
  const data = deriveTasksViewData(input);
  const widths: Record<string, number> = {
    [STATUS_COLUMN_ID]: 170,
    [ASSIGNEE_COLUMN_ID]: 190,
    [DUE_DATE_COLUMN_ID]: 160,
    [SOURCE_COLUMN_ID]: 210,
  };
  return {
    ...data,
    bootstrap: {
      ...data.bootstrap,
      properties: data.bootstrap.properties.map((property) => ({
        ...property,
        width: widths[property.id],
      })),
    },
  };
}

function TasksEmptyState({
  creating,
  onConfigure,
  onCreateDatabase,
}: {
  creating: boolean;
  onConfigure: () => void;
  onCreateDatabase: () => Promise<void>;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed px-6 py-16 text-center">
      <CheckCircle2Icon className="mx-auto size-10 text-content-secondary" />
      <p className="mx-auto mt-4 max-w-lg text-sm text-content-secondary">
        Connect an existing database with Status, Assignee, and Due date properties, or create one
        that is ready to use.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={onConfigure} type="button" variant="outline">
          <Settings2Icon />
          Connect databases
        </Button>
        <Button disabled={creating} onClick={() => void onCreateDatabase()} type="button">
          {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Create Tasks database
        </Button>
      </div>
    </div>
  );
}

function DatabaseWarnings({ payloads }: { payloads: DatabaseExportPayload[] }) {
  const warnings = payloads.flatMap((payload) => {
    const missing = getTaskDatabaseSchema(payload).missing;
    return missing.length ? [{ missing, payload }] : [];
  });
  if (warnings.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {warnings.map(({ missing, payload }) => (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-feedback-warning-subtle px-3 py-2 text-sm text-feedback-warning-text"
          key={payload.database.id}
        >
          <span className="font-medium">
            {payload.activeDataSource?.name ?? payload.database.name}
          </span>
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
  );
}

function ConfigureTaskDatabasesDialog({
  databases,
  onOpenChange,
  onSave,
  open,
  selectedDatabaseIds,
}: {
  databases: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSave: (databaseIds: string[]) => Promise<void>;
  open: boolean;
  selectedDatabaseIds: string[];
}) {
  const [draft, setDraft] = useState(selectedDatabaseIds);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(selectedDatabaseIds);
  }, [open, selectedDatabaseIds]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure My Tasks</DialogTitle>
          <DialogDescription>
            Connect up to 10 databases. Each needs Status, Assignee (person), and Due date
            properties.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto py-1">
          {databases.length === 0 ? (
            <p className="py-8 text-center text-sm text-content-secondary">
              No databases are available in this workspace.
            </p>
          ) : (
            databases.map((database) => {
              const checked = draft.includes(database.id);
              return (
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-action-neutral-hover has-disabled:cursor-not-allowed has-disabled:opacity-60"
                  key={database.id}
                >
                  <Checkbox
                    checked={checked}
                    disabled={!checked && draft.length >= 10}
                    onCheckedChange={(nextChecked) =>
                      setDraft((current) =>
                        nextChecked === true
                          ? [...current, database.id].slice(0, 10)
                          : current.filter((id) => id !== database.id),
                      )
                    }
                  />
                  <DatabaseIcon className="size-4 text-content-secondary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {database.name || "Untitled database"}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-content-secondary">{draft.length} of 10 connected</span>
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave(draft);
                  onOpenChange(false);
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Could not save task databases.",
                  );
                } finally {
                  setSaving(false);
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
  );
}

async function createTaskDatabase(
  context: ClientOperationContext,
  input: Parameters<typeof createSharedTaskDatabase>[1],
) {
  const result = await createSharedTaskDatabase(context, input);
  if (result.status === "already-connected")
    toast.message("That data source is already connected.");
  else
    toast.success(
      result.status === "linked" ? "Data source linked." : "Data source created and connected.",
    );
}

function createFilterId() {
  return `filter-${crypto.randomUUID()}`;
}
