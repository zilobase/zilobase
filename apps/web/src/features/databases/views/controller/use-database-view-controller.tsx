import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import { useSession } from "@zilobase/features/auth/react";
import { useZilobaseFeatures } from "@zilobase/features";
import {
  databaseViewQueryHash,
  getDatabaseInitialPageSize,
  isDatabaseLocked,
  prefetchDatabaseWindow,
} from "@zilobase/features/databases";
import {
  useAddDatabaseView,
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useApplyDatabaseTemplate,
  useCreateDatabaseDataSource,
  useDatabaseBootstrap,
  useDatabaseRecords,
  useDatabaseSessionId,
  useDeleteDatabaseView,
  useLinkDatabaseDataSource,
  useReplaceDatabaseViewDataSource,
  useUnlinkDatabaseDataSource,
  useUpdateDataSource,
  useUpdateDatabaseView,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
} from "@zilobase/features/databases/react";
import { toast } from "sonner"
import {
  createSampleRowContent,
  type DatabaseSetupSelection,
} from "../../setup/components/database-setup-card"
import { getDatabaseSetupTemplate } from "../../setup/model/database-setup-templates"
import { serializePropertyValue } from "../../schema/property-values"
import { usePage, usePagePersonAccessTargets, useUpdatePage } from "@zilobase/features/pages/react";
import {
  getDatabasePageDragPayload,
  hasDatabasePageDragPayload,
  type DatabasePageDragPayload,
} from "../../interactions/database-page-drop"
import type {
  DatabaseSourceViewSelection,
  DatabaseViewProviderValue,
} from "../state/database-view-context"
import { getDatabaseViewCommands } from "../../records/view-commands"
import { getDatabaseViewModel } from "../components/database-view-model"
import {
  readLatestViewConfig,
  writeLatestViewConfig,
} from "../model/view-config-cache"
import {
  composeDatabaseViewData,
  getDatabaseDataSourceSummaries,
  getDatabaseViewTabs,
  resolveRequestedDatabaseViewId,
  shouldUseDatabaseSetupMode,
} from "../model/database-controller-state"
import {
  getDatabaseSetupDismissed,
  getMergedDatabaseConfig,
} from "../model/database-view-config"
import {
  databaseViewTypeOptions,
  type DatabaseViewType,
} from "../view-settings/model/view-type-options"

export type DatabaseViewProps = {
  activeViewId?: string | null
  databaseId: string | null | undefined
  editable?: boolean
  fullPage?: boolean
  includeDeleted?: boolean
  onActiveViewIdChange?: (viewId: string | null) => void
  onOpenPage?: (
    pageId: string,
    options?: { databaseId?: string | null },
  ) => void
  onDismissSetup?: () => void
  onSetupComplete?: () => void
  onShowTitleChange?: (showTitle: boolean) => void
  workspaceId?: string | null
  setupMode?: boolean
  showExpandButton?: boolean
  showTitle?: boolean
  pageId?: string | null
}

export function useDatabaseViewController({
  activeViewId: requestedActiveViewId,
  databaseId,
  editable: requestedEditable = true,
  fullPage = false,
  includeDeleted = false,
  onActiveViewIdChange,
  onOpenPage,
  onDismissSetup,
  onSetupComplete,
  onShowTitleChange,
  workspaceId,
  setupMode = false,
  showExpandButton = false,
  showTitle = true,
  pageId = null,
}: DatabaseViewProps) {
  const updateDatabase = useUpdateDataSource()
  const applyDataSourceTemplate = useApplyDatabaseTemplate()
  const createDataSource = useCreateDatabaseDataSource()
  const updateDatabaseView = useUpdateDatabaseView()
  const addDatabaseView = useAddDatabaseView()
  const linkDatabaseDataSource = useLinkDatabaseDataSource()
  const replaceDatabaseViewDataSource = useReplaceDatabaseViewDataSource()
  const unlinkDatabaseDataSource = useUnlinkDatabaseDataSource()
  const deleteDatabaseView = useDeleteDatabaseView()
  const addProperty = useAddDatabaseProperty()
  const updateProperty = useUpdateDatabaseProperty()
  const addRow = useAddDatabaseRow()
  const updateValue = useUpdateDatabasePropertyValue()
  const updatePage = useUpdatePage()
  const subItemMigrationRequestsRef = useRef(new Set<string>())
  const { data: hostPage } = usePage(pageId, {
    refetchOnMount: false,
  })
  const includeDeletedDatabases = includeDeleted || Boolean(hostPage?.deletedAt)
  const bootstrapState = useDatabaseBootstrap(
    databaseId
      ? { databaseId, includeDeleted: includeDeletedDatabases }
      : null,
  )
  const bootstrap = bootstrapState.data
  const bootstrapViewData = useMemo(
    () => composeDatabaseViewData({
      bootstrap,
      dataSourceId: null,
      hasMore: false,
      records: [],
      totalCount: 0,
    }),
    [bootstrap],
  )
  const editable = requestedEditable && !isDatabaseLocked(bootstrap?.database)
  const [draftDatabaseTitle, setDraftDatabaseTitle] = useState("New database")
  const [draftViewTitle, setDraftViewTitle] = useState("Table")
  const [activeViewId, setActiveViewId] = useState<string | null>(
    requestedActiveViewId ?? null,
  )
  const [showFilterPill, setShowFilterPill] = useState(true)
  const [showSortPill, setShowSortPill] = useState(true)
  const [filterPickerOpen, setFilterPickerOpen] = useState(false)
  const [sortPickerOpen, setSortPickerOpen] = useState(false)
  const [dataSourceSetupOpen, setDataSourceSetupOpen] = useState(false)
  const latestViewConfigRef = useRef(new Map<string, unknown>())
  const isControlledActiveView = Boolean(onActiveViewIdChange)
  const dataSources = useMemo(
    () => getDatabaseDataSourceSummaries(
      bootstrapViewData?.bootstrap.dataSources,
      bootstrapViewData?.bootstrap.views,
    ),
    [bootstrapViewData],
  )
  const baseViewTabs = useMemo(
    () => getDatabaseViewTabs(
      bootstrapViewData?.bootstrap.dataSources,
      bootstrapViewData?.bootstrap.views,
    ),
    [bootstrapViewData],
  )
  const requestedViewId = resolveRequestedDatabaseViewId({
    requestedViewId: requestedActiveViewId,
    viewTabs: baseViewTabs,
  })
  const resolvedActiveViewId = isControlledActiveView
    ? (requestedViewId ?? baseViewTabs[0]?.id ?? null)
    : activeViewId
  const activeDataSourceId = bootstrap?.views.find(
    ({ id }) => id === resolvedActiveViewId,
  )?.dataSourceId ?? bootstrap?.dataSources[0]?.id ?? null
  const activeQueryHash = databaseViewQueryHash(
    bootstrap?.views.find(({ id }) => id === resolvedActiveViewId)?.config ??
      bootstrap?.database.config,
    includeDeletedDatabases,
  )
  const recordWindow = useDatabaseRecords(
    databaseId && resolvedActiveViewId && activeDataSourceId
      ? {
          databaseId,
          dataSourceId: activeDataSourceId,
          includeDeleted: includeDeletedDatabases,
          queryHash: activeQueryHash,
          viewId: resolvedActiveViewId,
        }
      : null,
  )
  const viewData = useMemo(
    () => composeDatabaseViewData({
      bootstrap,
      dataSourceId: activeDataSourceId,
      hasMore: recordWindow.hasMore,
      records: recordWindow.records,
      totalCount: recordWindow.totalCount,
    }),
    [
      activeDataSourceId,
      bootstrap,
      recordWindow.hasMore,
      recordWindow.records,
      recordWindow.totalCount,
    ],
  )
  const activeProperties = useMemo(
    () => (viewData?.bootstrap.properties ?? []).filter(
      (property) => property.dataSourceId === viewData?.dataSourceId,
    ),
    [viewData],
  )
  const setupDismissed = getDatabaseSetupDismissed(
    viewData?.activeDataSource?.config,
  )
  const hasSetupContent = Boolean(
    viewData &&
      (activeProperties.length > 0 ||
        viewData.totalCount > 0 ||
        viewData.bootstrap.dataSources.length > 1),
  )
  const effectiveSetupMode = shouldUseDatabaseSetupMode({
    // Emptiness is only knowable after load: unloaded and placeholder states
    // always compute hasContent === false, so the setup dialog must wait for
    // this hash's real result. Background refetches keep settled data (not
    // placeholder), so an already-correct dialog never flickers.
    dataSettled: bootstrapState.status === "success" &&
      recordWindow.status === "success" &&
      !recordWindow.isPlaceholderData,
    editable,
    hasContent: hasSetupContent,
    setupDismissed,
    setupMode,
  })
  const activeViewData = viewData
  const activeDatabaseId = activeViewData?.activeDataSource?.id ?? null
  const viewTabs = baseViewTabs
  const activeFetchNextPage = recordWindow.fetchNextPage
  const activeHasNextPage = recordWindow.hasMore
  const activeIsFetchingNextPage = recordWindow.isFetchingNextPage
  const activeViewLookupId = resolvedActiveViewId
  const { data: session } = useSession()
  const needsPersonAccessTargets = useMemo(
    () =>
      activeProperties.some(
        (property) => property.property.type === "person",
      ),
    [activeProperties],
  )
  const { data: accessTargets } = usePagePersonAccessTargets(
    activeViewData?.bootstrap.database.pageId,
    { enabled: needsPersonAccessTargets },
  )
  const activeViewTabId = resolvedActiveViewId
  const setSelectedActiveViewId = useCallback<
    DatabaseViewProviderValue["setActiveViewId"]
  >(
    (value) => {
      setActiveViewId((currentViewId) => {
        const nextViewId =
          typeof value === "function"
            ? value(
                isControlledActiveView ? resolvedActiveViewId : currentViewId,
              )
            : value

        if (nextViewId !== currentViewId) {
          onActiveViewIdChange?.(nextViewId)
        }

        return nextViewId
      })
    },
    [isControlledActiveView, onActiveViewIdChange, resolvedActiveViewId],
  )

  const { apiFetch, queryClient } = useZilobaseFeatures()
  const sessionId = useDatabaseSessionId()
  const prefetchDatabaseView = useCallback((viewId: string) => {
    if (!databaseId || !bootstrap || viewId === resolvedActiveViewId) return
    const view = bootstrap.views.find((candidate) => candidate.id === viewId)
    if (!view) return
    void prefetchDatabaseWindow(queryClient, apiFetch, sessionId, {
      databaseId,
      dataSourceId: view.dataSourceId,
      includeDeleted: includeDeletedDatabases,
      queryHash: databaseViewQueryHash(view.config, includeDeletedDatabases),
      viewId: view.id,
    }, getDatabaseInitialPageSize(view.config ?? bootstrap.database.config))
  }, [
    apiFetch,
    bootstrap,
    databaseId,
    includeDeletedDatabases,
    queryClient,
    resolvedActiveViewId,
    sessionId,
  ])

  useEffect(() => {
    if (
      typeof window === "undefined" || !bootstrap ||
      recordWindow.status !== "success"
    ) {
      return
    }
    const pending = bootstrap.views
      .filter((view) =>
        view.id !== resolvedActiveViewId &&
        view.dataSourceId === activeDataSourceId
      )
      .slice(0, 3)
    if (pending.length === 0) return
    let cancelled = false
    const run = () => {
      if (cancelled) return
      for (const view of pending) prefetchDatabaseView(view.id)
    }
    let idleHandle: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(() => run(), { timeout: 1_200 })
    } else {
      timer = globalThis.setTimeout(run, 400)
    }
    return () => {
      cancelled = true
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle)
      if (timer !== null) globalThis.clearTimeout(timer)
    }
  }, [
    activeDataSourceId,
    bootstrap,
    prefetchDatabaseView,
    recordWindow.status,
    resolvedActiveViewId,
  ])

  const viewModel = useMemo(
    () =>
      getDatabaseViewModel({
        accessTargets,
        activeViewId: activeViewLookupId,
        currentUserId: session?.user?.id,
        viewData: activeViewData,
      }),
    [accessTargets, activeViewData, activeViewLookupId, session?.user?.id],
  )
  const {
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    activeVisibilityConfig,
    addableFilterFieldOptions,
    addableSortFieldOptions,
    canAddDatabaseFilter,
    canAddDatabaseSort,
    chartSettings,
    filterFieldOptions,
    filterValueOptionsByField,
    filteredItems,
    groupOptions,
    groupProperty,
    groupableProperties,
    isKanbanView,
    isTimelineView,
    items,
    kanbanGroupProperty,
    kanbanOptions,
    layoutSettings,
    timelineDateProperties,
    timelineDateProperty,
    personOptions,
    properties,
    propertyValuesByKey,
    showPageIconInTitle,
    showPropertyTitles,
    sortFieldOptions,
    sortedItems,
    subItemChildRowIdsByParentId,
    subItemDepthByRowId,
    subItemParentRowIdsByRowId,
    subItemsSettings,
    titlePropertyLabel,
    visibleProperties,
    visiblePropertyCount,
  } = viewModel
  useEffect(() => {
    if (
      !editable ||
      !databaseId ||
      !activeDatabaseId ||
      !activeView?.id ||
      !subItemsSettings.enabled ||
      (subItemsSettings.parentPropertyId &&
        subItemsSettings.subItemPropertyId)
    ) {
      return
    }

    const requestKey = `${activeDatabaseId}:${activeView.id}`
    if (subItemMigrationRequestsRef.current.has(requestKey)) return

    subItemMigrationRequestsRef.current.add(requestKey)
    updateDatabaseView.mutate(
      {
        config: getMergedDatabaseConfig(activeView.config, {
          subItems: subItemsSettings,
        }),
        databaseId,
        databaseViewId: activeView.id,
      },
      {
        onError: () => {
          subItemMigrationRequestsRef.current.delete(requestKey)
        },
      },
    )
  }, [
    activeDatabaseId,
    activeView?.config,
    activeView?.id,
    editable,
    subItemsSettings,
    updateDatabaseView,
  ])
  useEffect(() => {
    const nextDatabaseTitle = activeViewData?.activeDataSource?.name

    if (nextDatabaseTitle) {
      setDraftDatabaseTitle(nextDatabaseTitle)
    }
  }, [
    activeViewData?.activeDataSource?.name,
  ])

  useEffect(() => {
    if (isControlledActiveView) {
      return
    }

    if (viewTabs.length === 0) {
      setActiveViewId(null)
      return
    }

    setActiveViewId((currentViewId) => {
      return currentViewId && viewTabs.some((view) => view.id === currentViewId)
        ? currentViewId
        : (viewTabs[0]?.id ?? null)
    })
  }, [isControlledActiveView, viewTabs])

  useEffect(() => {
    const nextViewTitle = activeView?.name

    if (nextViewTitle) {
      setDraftViewTitle(nextViewTitle)
    }
  }, [activeView?.id, activeView?.name])

  useEffect(() => {
    if (activeDatabaseSorts.length === 0) {
      setShowSortPill(false)
    }
  }, [activeDatabaseSorts.length])

  useEffect(() => {
    if (activeDatabaseFilters.length === 0) {
      setShowFilterPill(false)
    }
  }, [activeDatabaseFilters.length])

  useEffect(() => {
    if (!updateDatabaseView.isPending) {
      latestViewConfigRef.current.clear()
    }
  }, [activeViewData?.bootstrap.views, updateDatabaseView.isPending])

  const getLatestViewConfig = useCallback(
    (
      nextDatabaseId: string,
      databaseViewId: string,
      fallbackConfig: unknown,
    ) => {
      return readLatestViewConfig({
        cache: latestViewConfigRef.current,
        databaseId: nextDatabaseId,
        databaseViewId,
        fallbackConfig,
        views: activeViewData?.bootstrap.views,
      })
    },
    [activeViewData?.bootstrap.views],
  )

  const setLatestViewConfig = useCallback(
    (nextDatabaseId: string, databaseViewId: string, config: unknown) => {
      writeLatestViewConfig({
        cache: latestViewConfigRef.current,
        config,
        databaseId: nextDatabaseId,
        databaseViewId,
      })
    },
    [],
  )

  const getSourcePropertyMode = useCallback(
    async (_dragPayload: DatabasePageDragPayload) => {
      return "match" as const
    },
    [],
  )

  const linkDataSourceView = (selection: DatabaseSourceViewSelection) => {
    if (!databaseId || linkDatabaseDataSource.isPending) return
    linkDatabaseDataSource.mutate(
      {
        databaseId,
        config: selection.viewConfig,
        dataSourceId: selection.dataSourceId,
        name: selection.viewName,
        type: selection.viewType,
      },
      {
        onSuccess: ({ view }) => {
          setSelectedActiveViewId(view.id)
          toast.success("Data source linked.")
        },
      },
    )
  }

  const unlinkDataSource = async (dataSourceId: string) => {
    if (
      !databaseId ||
      !editable ||
      unlinkDatabaseDataSource.isPending ||
      deleteDatabaseView.isPending
    ) {
      return
    }

    const source = bootstrap?.dataSources.find(
      (candidate) => candidate.id === dataSourceId,
    )
    if (!source || source.parentDatabaseId === databaseId) return

    const sourceViewIds =
      bootstrap?.views
        .filter((view) => view.dataSourceId === dataSourceId)
        .map((view) => view.id) ?? []
    const fallbackViewId =
      bootstrap?.views.find((view) => view.dataSourceId !== dataSourceId)?.id ??
      null

    try {
      for (const databaseViewId of sourceViewIds) {
        await deleteDatabaseView.mutateAsync({ databaseId, databaseViewId })
      }
      await unlinkDatabaseDataSource.mutateAsync({ databaseId, dataSourceId })
      setSelectedActiveViewId(fallbackViewId)
      toast.success("Linked data source removed.")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not remove the linked data source.",
      )
    }
  }

  const replaceActiveViewSource = async (
    selection: DatabaseSourceViewSelection,
  ) => {
    if (
      !databaseId ||
      !resolvedActiveViewId ||
      !editable ||
      replaceDatabaseViewDataSource.isPending
    ) return

    await replaceDatabaseViewDataSource.mutateAsync({
      databaseId,
      databaseViewId: resolvedActiveViewId,
      dataSourceId: selection.dataSourceId,
    })
    setSelectedActiveViewId(resolvedActiveViewId)
    toast.success("View source replaced.")
  }

  const addDataSourceView = async (
    dataSourceId: string,
    type: DatabaseViewType,
    mode: "add" | "replace" = "add",
  ) => {
    if (
      !databaseId ||
      !editable ||
      linkDatabaseDataSource.isPending ||
      replaceDatabaseViewDataSource.isPending
    ) {
      return
    }

    const option = databaseViewTypeOptions.find(
      (candidate) => candidate.type === type,
    )
    const viewName = option?.label ?? "Table"

    try {
      if (mode === "replace") {
        if (!resolvedActiveViewId) return
        await replaceDatabaseViewDataSource.mutateAsync({
          databaseId,
          databaseViewId: resolvedActiveViewId,
          dataSourceId,
        })
        toast.success("View source replaced.")
        return
      }
      const { view } = await linkDatabaseDataSource.mutateAsync({
        databaseId,
        dataSourceId,
        name: viewName,
        type,
      })
      setSelectedActiveViewId(view.id)
      toast.success(`${viewName} view added.`)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add the view.",
      )
    }
  }

  const handleDataSourceSetupSelection = async (
    selection: DatabaseSetupSelection,
  ) => {
    if (
      !editable ||
      !databaseId ||
      createDataSource.isPending ||
      updateDatabase.isPending
    ) {
      return
    }

    try {
      if (selection.sourceView) {
        const { view } = await linkDatabaseDataSource.mutateAsync({
          databaseId,
          config: selection.sourceView.viewConfig,
          dataSourceId: selection.sourceView.dataSourceId,
          name: selection.sourceView.viewName,
          type: selection.sourceView.viewType,
        })
        setSelectedActiveViewId(view.id)
        toast.success("Data source linked.")
        return
      }

      const template = selection.templateId
        ? getDatabaseSetupTemplate(selection.templateId)
        : null
      const databaseName =
        selection.databaseName ||
        selection.csvImport?.name ||
        template?.name ||
        "New data source"
      const created = await createDataSource.mutateAsync({
        databaseId,
        name: databaseName,
      })
      const createdSource = created.dataSource
      if (selection.csvImport) {
        await applyDataSourceTemplate.mutateAsync({
          config: getMergedDatabaseConfig(createdSource.config, {
            setupDismissed: true,
          }),
          databaseId: createdSource.id,
          name: databaseName,
          properties: selection.csvImport.headers.slice(1).map((name) => ({
            name,
            type: "text",
          })),
          rows: selection.csvImport.rows.map((row, rowIndex) => ({
            title: row[0]?.trim() || `Row ${rowIndex + 1}`,
            values: selection.csvImport!.headers
              .slice(1)
              .map((propertyName, index) => ({
                propertyName,
                value: serializePropertyValue("text", row[index + 1] ?? ""),
              })),
          })),
        })
      } else if (template) {
        const propertyTypesByName = new Map(
          template.properties.map((property) => [
            property.name.toLowerCase(),
            property.type,
          ]),
        )

        await applyDataSourceTemplate.mutateAsync({
          config: getMergedDatabaseConfig(createdSource.config, {
            emoji: template.emoji,
            setupDismissed: true,
          }),
          databaseId: createdSource.id,
          name: databaseName,
          properties: template.properties,
          rows: template.sampleRows.map((sampleRow) => ({
            content: createSampleRowContent(sampleRow.content),
            metadata: { emoji: sampleRow.emoji },
            title: sampleRow.title,
            values: Object.entries(sampleRow.values ?? {}).flatMap(
              ([propertyName, value]) => {
                const propertyType = propertyTypesByName.get(
                  propertyName.toLowerCase(),
                )

                return propertyType
                  ? [
                      {
                        propertyName,
                        value: serializePropertyValue(propertyType, value),
                      },
                    ]
                  : []
              },
            ),
          })),
        })
      }

      setSelectedActiveViewId(created.view.id)
      toast.success("Data source added.")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not add the data source.",
      )
    }
  }

  const saveDatabaseViewIcon: DatabaseViewProviderValue["saveDatabaseViewIcon"] = (
    view,
    nextIcon,
  ) => {
    if (!editable || !databaseId) {
      return
    }

    const sourceView = bootstrap?.views.find(
      (candidate) => candidate.id === view.id,
    )

    if (!sourceView) {
      return
    }

    updateDatabaseView.mutate({
      config: getMergedDatabaseConfig(sourceView.config, { icon: nextIcon }),
      databaseId,
      databaseViewId: sourceView.id,
    })
  }

  const duplicateDatabaseView = (
    view: DatabaseViewProviderValue["viewTabs"][number],
  ) => {
    if (!databaseId || addDatabaseView.isPending || updateDatabase.isPending) {
      return
    }

    const sourceView = (bootstrap?.views ?? []).find(
      (databaseView) => databaseView.id === view.id,
    )

    if (!sourceView) {
      return
    }

    addDatabaseView.mutate(
      {
        config: sourceView.config,
        databaseId,
        dataSourceId: sourceView.dataSourceId,
        name: `${sourceView.name} copy`,
        type: sourceView.type,
      },
      {
        onSuccess: (view) => {
          setSelectedActiveViewId(view.id)
        },
      },
    )
  }

  const deleteDatabaseViewByTab = (
    view: DatabaseViewProviderValue["viewTabs"][number],
  ) => {
    if (
      !databaseId ||
      deleteDatabaseView.isPending
    ) {
      return
    }

    if (viewTabs.length <= 1) {
      toast.error("A database must always have at least one view.")
      return
    }

    const nextActiveViewId =
      activeViewTabId === view.id
        ? (viewTabs.find((viewTab) => viewTab.id !== view.id)?.id ?? null)
        : activeViewTabId

    deleteDatabaseView.mutate(
      {
        databaseId,
        databaseViewId: view.id,
      },
      {
        onSuccess: () => setSelectedActiveViewId(nextActiveViewId),
      },
    )
  }

  const commands = getDatabaseViewCommands({
    notify: toast,
    copyViewLink: (id) => typeof window === "undefined" ? undefined : navigator.clipboard.writeText(`${window.location.origin}/d/${id}`),
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    databaseId: activeDatabaseId,
    viewDatabaseId: databaseId,
    editable,
    isKanbanView,
    items,
    kanbanGroupProperty,
    timelineDateProperty,
    mutations: {
      addDatabaseView,
      addProperty,
      addRow,
      updateDatabase,
      updateDatabaseView,
      updatePage,
      updateProperty,
      updateValue,
    },
    viewData: activeViewData,
    properties,
    setActiveViewId: setSelectedActiveViewId,
    setFilterPickerOpen,
    setShowFilterPill,
    setShowSortPill,
    setSortPickerOpen,
    getLatestViewConfig,
    getSourcePropertyMode,
    setLatestViewConfig,
  })

  const handleDatabaseBlockDragOver = (
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    if (!editable || !hasDatabasePageDragPayload(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }

  const handleDatabaseBlockDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!editable) {
      return
    }

    const dragPayload = getDatabasePageDragPayload(event.dataTransfer)

    if (!dragPayload) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    commands.addDraggedPageRow(dragPayload, items.length)
  }

  const databaseViewContext: DatabaseViewProviderValue = {
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    activeViewTabId,
    activeVisibilityConfig,
    addDataSource: () => setDataSourceSetupOpen(true),
    addableFilterFieldOptions,
    addableSortFieldOptions,
    addDatabaseProperty: commands.addDatabaseProperty,
    addChartView: commands.addChartView,
    addFormView: commands.addFormView,
    addGalleryView: commands.addGalleryView,
    addDraggedPageRow: commands.addDraggedPageRow,
    addKanbanView: commands.addKanbanView,
    addListView: commands.addListView,
    linkDataSourceView,
    unlinkDataSource,
    addDataSourceView,
    replaceActiveViewSource,
    addDatabaseRow: commands.addDatabaseRow,
    addTableView: commands.addTableView,
    addTimelineRow: commands.addTimelineRow,
    addTimelineView: commands.addTimelineView,
    canAddDatabaseFilter,
    canAddDatabaseProperties: true,
    canAddDatabaseRows: true,
    canAddDatabaseViews: editable,
    canAddDatabaseSort,
    chartSettings,
    propertyValuesByKey,
    clearDatabaseFilter: commands.clearDatabaseFilter,
    clearDatabaseSort: commands.clearDatabaseSort,
    copyDatabaseViewLink: commands.copyDatabaseViewLink,
    createDatabaseFilter: commands.createDatabaseFilter,
    createDatabaseSort: commands.createDatabaseSort,
    dataSources,
    databaseConfig:
      activeViewData?.activeDataSource?.config,
    databaseId: activeDatabaseId,
    databaseName:
      activeViewData?.activeDataSource?.name,
    databasePageId: activeViewData?.bootstrap.database.pageId,
    databaseWorkspaceId: activeViewData?.bootstrap.database.workspaceId,
    deleteDatabaseView: deleteDatabaseViewByTab,
    duplicateDatabaseView,
    draftDatabaseTitle,
    draftViewTitle,
    editable,
    fetchNextPage: activeFetchNextPage,
    filterFieldOptions,
    filterPickerOpen,
    filterValueOptionsByField,
    filteredItems,
    fullPage,
    getDatabasePageDragPayload,
    groupOptions,
    groupProperty,
    groupableProperties,
    hasDatabasePageDragPayload,
    hasNextPage: activeHasNextPage,
    headerMenusEnabled: editable,
    hostDatabaseId: bootstrap?.database.id ?? databaseId,
    hostDatabaseName: bootstrap?.database.name,
    hostDatabaseWorkspaceId: bootstrap?.database.workspaceId,
    hostViews: bootstrap?.views ?? [],
    isAddingDatabaseProperty: addProperty.isPending,
    isAddingDatabaseRow: addRow.isPending,
    isAddingDataSource:
      createDataSource.isPending ||
      applyDataSourceTemplate.isPending ||
      linkDatabaseDataSource.isPending,
    isAddingDatabaseView:
      addDatabaseView.isPending || replaceDatabaseViewDataSource.isPending,
    isTimelineView,
    isFetchingNextPage: activeIsFetchingNextPage,
    layoutSettings,
    titlePropertyLabel,
    showPageIconInTitle,
    onOpenPage,
    options: kanbanOptions,
    workspaceId: bootstrap?.database.workspaceId ?? workspaceId,
    personOptions,
    prefetchDatabaseView,
    properties,
    removeDatabaseFilter: commands.removeDatabaseFilter,
    removeDatabaseSort: commands.removeDatabaseSort,
    renameDatabaseProperty: commands.renameDatabaseProperty,
    reorderDatabaseFilters: commands.reorderDatabaseFilters,
    items,
    savePropertyValue: commands.savePropertyValue,
    saveDatabaseEmoji: commands.saveDatabaseEmoji,
    saveDatabaseTitle: commands.saveDatabaseTitle,
    saveDatabaseViewIcon,
    saveDatabaseConditionalColors: commands.saveDatabaseConditionalColors,
    saveDatabaseFilters: commands.saveDatabaseFilters,
    saveDatabasePropertyOrder: commands.saveDatabasePropertyOrder,
    saveDatabaseSorts: commands.saveDatabaseSorts,
    saveDatabaseViewTitle: commands.saveDatabaseViewTitle,
    setActiveViewId: setSelectedActiveViewId,
    setDraftDatabaseTitle,
    setDraftViewTitle,
    setFilterPickerOpen,
    setViewDateProperty: commands.setViewDateProperty,
    setupTimelineDateProperty: commands.setupTimelineDateProperty,
    setViewGroupProperty: commands.setViewGroupProperty,
    setViewType: commands.setViewType,
    timelineDateProperties,
    timelineDateProperty,
    setSortPickerOpen,
    showExpandButton,
    showFilterPill,
    showSortPill,
    showPropertyTitles,
    showTitle,
    onShowTitleChange,
    sortFieldOptions,
    sortPickerOpen,
    sortedItems,
    subItemChildRowIdsByParentId,
    subItemDepthByRowId,
    subItemParentRowIdsByRowId,
    subItemsSettings,
    togglePropertyVisibility: commands.togglePropertyVisibility,
    toggleFilterPillVisibility: commands.toggleFilterPillVisibility,
    togglePropertyTitles: commands.togglePropertyTitles,
    toggleSortPillVisibility: commands.toggleSortPillVisibility,
    updateDatabasePropertyConfig: commands.updateDatabasePropertyConfig,
    updateDatabaseChartSettings: commands.updateDatabaseChartSettings,
    updateDatabaseLayoutSettings: commands.updateDatabaseLayoutSettings,
    updateDatabaseFilter: commands.updateDatabaseFilter,
    updateDatabaseFormHeaderSettings: commands.updateDatabaseFormHeaderSettings,
    updateDatabaseFormQuestionSettings:
      commands.updateDatabaseFormQuestionSettings,
    updateDatabaseFormShareSettings: commands.updateDatabaseFormShareSettings,
    updateNameColumnConfig: commands.updateNameColumnConfig,
    updateDatabaseSort: commands.updateDatabaseSort,
    updateDatabaseSubItemsSettings: commands.updateDatabaseSubItemsSettings,
    visibleProperties,
    visiblePropertyCount,
    viewTabs,
    views: activeViewData?.bootstrap.views ?? [],
  }

  return {
    className: fullPage
      ? "database-block-shell database-block-shell-full"
      : "database-block-shell",
    context: databaseViewContext,
    dataSourceSetupOpen,
    databaseId,
    error: recordWindow.error ?? bootstrapState.error,
    isError:
      recordWindow.status === "error" || bootstrapState.status === "error",
    handleDatabaseBlockDragOver,
    handleDatabaseBlockDrop,
    isLoading:
      Boolean(databaseId) &&
      (bootstrapState.status === "idle" ||
        bootstrapState.status === "loading" ||
        (Boolean(resolvedActiveViewId && activeDataSourceId) &&
          (recordWindow.status === "idle" ||
            recordWindow.status === "loading"))),
    onDismissSetup,
    onDataSourceSetupClose: () => setDataSourceSetupOpen(false),
    onDataSourceSetupSelect: handleDataSourceSetupSelection,
    onSetupComplete,
    workspaceId: bootstrap?.database.workspaceId ?? workspaceId,
    viewData: activeViewData,
    sourcePropertyDialog: null,
    setupMode: effectiveSetupMode,
    viewType: activeView?.type,
    pageId,
  }
}
