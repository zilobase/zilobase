import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import { useSession } from "@zilobase/features/auth"
import {
  useAddDatabaseView,
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useDatabase,
  useDeleteDatabaseView,
  isDatabaseLocked,
  useUpdateDatabase,
  useUpdateDatabaseView,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
} from "@zilobase/features/databases"
import {
  usePage,
  usePagePersonAccessTargets,
  useUpdatePage,
} from "@zilobase/features/pages"
import {
  getDatabasePageDragPayload,
  hasDatabasePageDragPayload,
  type DatabasePageDragPayload,
} from "../interactions/database-page-drop"
import type { DatabaseViewContextValue } from "./database-view-context"
import { getDatabaseViewCommands } from "./database-view-commands"
import { getDatabaseViewModel } from "./database-view-model"
import {
  getDatabaseLinkedViewKey,
  getDatabaseLinkedViews,
  getDatabaseSetupDismissed,
  getDatabaseViewIcon,
  getMergedDatabaseConfig,
  type DatabaseLinkedViewConfig,
} from "./database-view-config"

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
  const updateDatabase = useUpdateDatabase()
  const updateDatabaseView = useUpdateDatabaseView()
  const addDatabaseView = useAddDatabaseView()
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
  const {
    data: payload,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    error,
    isError,
    isLoading,
  } = useDatabase(databaseId, {
    includeDeleted: includeDeletedDatabases,
  })
  const editable = requestedEditable && !isDatabaseLocked(payload?.database)
  const [draftDatabaseTitle, setDraftDatabaseTitle] = useState("New database")
  const [draftViewTitle, setDraftViewTitle] = useState("Table")
  const [activeViewId, setActiveViewId] = useState<string | null>(
    requestedActiveViewId ?? null,
  )
  const [showFilterPill, setShowFilterPill] = useState(true)
  const [showSortPill, setShowSortPill] = useState(true)
  const [filterPickerOpen, setFilterPickerOpen] = useState(false)
  const [sortPickerOpen, setSortPickerOpen] = useState(false)
  const latestViewConfigRef = useRef(new Map<string, unknown>())
  const isControlledActiveView = Boolean(onActiveViewIdChange)
  const linkedDatabaseViews = useMemo(
    () => getDatabaseLinkedViews(payload?.database.config),
    [payload?.database.config],
  )
  const baseViewTabs = useMemo(
    () => [
      ...(payload?.views ?? []).map((view) => ({
        icon: getDatabaseViewIcon(view.config),
        id: view.id,
        name: view.name,
        type: view.type,
      })),
      ...linkedDatabaseViews.map((linkedView) => ({
        icon: linkedView.viewIcon,
        id: getDatabaseLinkedViewKey(linkedView),
        isLinked: true,
        name: linkedView.viewName,
        sourceDatabaseId: linkedView.databaseId,
        sourceDatabaseName: linkedView.databaseName,
        sourceViewId: linkedView.viewId,
        type: linkedView.viewType,
      })),
    ],
    [linkedDatabaseViews, payload?.views],
  )
  const requestedViewId =
    requestedActiveViewId &&
    baseViewTabs.some((view) => view.id === requestedActiveViewId)
      ? requestedActiveViewId
      : null
  const resolvedActiveViewId = isControlledActiveView
    ? (requestedViewId ?? baseViewTabs[0]?.id ?? null)
    : activeViewId
  const setupDismissed = getDatabaseSetupDismissed(payload?.database.config)
  const hasDatabaseSetupContent = Boolean(
    payload &&
    (payload.properties.length > 0 ||
      (payload.rowCount ?? payload.rows.length) > 0 ||
      linkedDatabaseViews.length > 0),
  )
  const effectiveSetupMode = Boolean(
    editable &&
    payload &&
    !setupDismissed &&
    (setupMode || !hasDatabaseSetupContent),
  )
  const activeLinkedDatabaseView = useMemo(
    () =>
      linkedDatabaseViews.find(
        (linkedView) =>
          getDatabaseLinkedViewKey(linkedView) === resolvedActiveViewId,
      ) ?? null,
    [linkedDatabaseViews, resolvedActiveViewId],
  )
  const {
    data: linkedPayload,
    fetchNextPage: fetchNextLinkedPage,
    hasNextPage: hasNextLinkedPage,
    isFetchingNextPage: isFetchingNextLinkedPage,
    error: linkedError,
    isError: isLinkedError,
    isLoading: isLoadingLinkedPayload,
  } = useDatabase(activeLinkedDatabaseView?.databaseId, {
    includeDeleted: includeDeletedDatabases,
  })
  const activePayload = activeLinkedDatabaseView ? linkedPayload : payload
  const activeDatabaseId = activeLinkedDatabaseView?.databaseId ?? databaseId
  const viewTabs = useMemo(() => {
    if (!activeLinkedDatabaseView || !linkedPayload) {
      return baseViewTabs
    }

    const sourceView = linkedPayload.views.find(
      (view) => view.id === activeLinkedDatabaseView.viewId,
    )
    const sourceIcon = getDatabaseViewIcon(sourceView?.config)
    const linkedViewKey = getDatabaseLinkedViewKey(activeLinkedDatabaseView)

    return baseViewTabs.map((view) =>
      view.id === linkedViewKey ? { ...view, icon: sourceIcon } : view,
    )
  }, [activeLinkedDatabaseView, baseViewTabs, linkedPayload])
  const activeFetchNextPage = activeLinkedDatabaseView
    ? fetchNextLinkedPage
    : fetchNextPage
  const activeHasNextPage = activeLinkedDatabaseView
    ? hasNextLinkedPage
    : hasNextPage
  const activeIsFetchingNextPage = activeLinkedDatabaseView
    ? isFetchingNextLinkedPage
    : isFetchingNextPage
  const activeViewLookupId =
    activeLinkedDatabaseView?.viewId ?? resolvedActiveViewId
  const { data: session } = useSession()
  const needsPersonAccessTargets = useMemo(
    () =>
      (activePayload?.properties ?? []).some(
        (property) => property.property.type === "person",
      ),
    [activePayload?.properties],
  )
  const { data: accessTargets } = usePagePersonAccessTargets(
    activePayload?.database.pageId,
    { enabled: needsPersonAccessTargets },
  )
  const activeViewTabId = activeLinkedDatabaseView
    ? getDatabaseLinkedViewKey(activeLinkedDatabaseView)
    : resolvedActiveViewId
  const setSelectedActiveViewId = useCallback<
    DatabaseViewContextValue["setActiveViewId"]
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

  const viewModel = useMemo(
    () =>
      getDatabaseViewModel({
        accessTargets,
        activeViewId: activeViewLookupId,
        currentUserId: session?.user?.id,
        payload: activePayload,
      }),
    [accessTargets, activePayload, activeViewLookupId, session?.user?.id],
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
        databaseId: activeDatabaseId,
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
    const nextDatabaseTitle =
      activePayload?.database.name ?? activeLinkedDatabaseView?.databaseName

    if (nextDatabaseTitle) {
      setDraftDatabaseTitle(nextDatabaseTitle)
    }
  }, [
    activeLinkedDatabaseView?.databaseName,
    activePayload?.database.id,
    activePayload?.database.name,
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
    const nextViewTitle = activeView?.name ?? activeLinkedDatabaseView?.viewName

    if (nextViewTitle) {
      setDraftViewTitle(nextViewTitle)
    }
  }, [activeLinkedDatabaseView?.viewName, activeView?.id, activeView?.name])

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
  }, [activePayload?.views, updateDatabaseView.isPending])

  const getLatestViewConfig = useCallback(
    (
      nextDatabaseId: string,
      databaseViewId: string,
      fallbackConfig: unknown,
    ) => {
      const configKey = `${nextDatabaseId}:${databaseViewId}`

      if (latestViewConfigRef.current.has(configKey)) {
        return latestViewConfigRef.current.get(configKey)
      }

      return (
        activePayload?.views.find((view) => view.id === databaseViewId)
          ?.config ?? fallbackConfig
      )
    },
    [activePayload?.views],
  )

  const setLatestViewConfig = useCallback(
    (nextDatabaseId: string, databaseViewId: string, config: unknown) => {
      latestViewConfigRef.current.set(
        `${nextDatabaseId}:${databaseViewId}`,
        config,
      )
    },
    [],
  )

  const getSourcePropertyMode = useCallback(
    async (_dragPayload: DatabasePageDragPayload) => {
      return "match" as const
    },
    [],
  )

  const addLinkedDatabaseView = (linkedView: DatabaseLinkedViewConfig) => {
    if (!databaseId) {
      return
    }

    const linkedViewKey = getDatabaseLinkedViewKey(linkedView)

    if (
      linkedDatabaseViews.some(
        (existingView) =>
          getDatabaseLinkedViewKey(existingView) === linkedViewKey,
      )
    ) {
      setSelectedActiveViewId(linkedViewKey)
      return
    }

    updateDatabase.mutate(
      {
        config: getMergedDatabaseConfig(payload?.database.config, {
          linkedDatabaseViews: [...linkedDatabaseViews, linkedView],
        }),
        databaseId,
      },
      {
        onSuccess: () => setSelectedActiveViewId(linkedViewKey),
      },
    )
  }

  const saveDatabaseViewIcon: DatabaseViewContextValue["saveDatabaseViewIcon"] = (
    view,
    nextIcon,
  ) => {
    if (!editable || !databaseId) {
      return
    }

    if (view.isLinked) {
      const linkedView = linkedDatabaseViews.find(
        (candidate) => getDatabaseLinkedViewKey(candidate) === view.id,
      )

      if (!linkedView) {
        return
      }

      const sourceView = activeLinkedDatabaseView
        ? linkedPayload?.views.find(
            (candidate) => candidate.id === linkedView.viewId,
          )
        : undefined

      updateDatabaseView.mutate({
        config: getMergedDatabaseConfig(sourceView?.config, { icon: nextIcon }),
        databaseId: linkedView.databaseId,
        databaseViewId: linkedView.viewId,
      })

      updateDatabase.mutate({
        config: getMergedDatabaseConfig(payload?.database.config, {
          linkedDatabaseViews: linkedDatabaseViews.map((candidate) =>
            getDatabaseLinkedViewKey(candidate) === view.id
              ? { ...candidate, viewIcon: nextIcon }
              : candidate,
          ),
        }),
        databaseId,
      })
      return
    }

    const sourceView = payload?.views.find(
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
    view: DatabaseViewContextValue["viewTabs"][number],
  ) => {
    if (!databaseId || addDatabaseView.isPending || updateDatabase.isPending) {
      return
    }

    if (view.isLinked) {
      const sourceLinkedView = linkedDatabaseViews.find(
        (linkedView) => getDatabaseLinkedViewKey(linkedView) === view.id,
      )

      if (!sourceLinkedView) {
        return
      }

      const linkedViewId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${sourceLinkedView.databaseId}-${sourceLinkedView.viewId}-${Date.now()}`

      updateDatabase.mutate(
        {
          config: getMergedDatabaseConfig(payload?.database.config, {
            linkedDatabaseViews: [
              ...linkedDatabaseViews,
              {
                ...sourceLinkedView,
                linkedViewId,
                viewName: `${sourceLinkedView.viewName} copy`,
              },
            ],
          }),
          databaseId,
        },
        {
          onSuccess: () => setSelectedActiveViewId(`linked:${linkedViewId}`),
        },
      )
      return
    }

    const sourceView = (payload?.views ?? []).find(
      (databaseView) => databaseView.id === view.id,
    )

    if (!sourceView) {
      return
    }

    const existingViewIds = new Set(
      (payload?.views ?? []).map((databaseView) => databaseView.id),
    )

    addDatabaseView.mutate(
      {
        config: sourceView.config,
        databaseId,
        name: `${sourceView.name} copy`,
        type: sourceView.type,
      },
      {
        onSuccess: (nextPayload) => {
          const addedView =
            nextPayload.views.find(
              (databaseView) => !existingViewIds.has(databaseView.id),
            ) ?? nextPayload.views.at(-1)

          setSelectedActiveViewId(addedView?.id ?? null)
        },
      },
    )
  }

  const deleteDatabaseViewByTab = (
    view: DatabaseViewContextValue["viewTabs"][number],
  ) => {
    if (
      !databaseId ||
      deleteDatabaseView.isPending ||
      updateDatabase.isPending
    ) {
      return
    }

    if (viewTabs.length <= 1) {
      return
    }

    const nextActiveViewId =
      activeViewTabId === view.id
        ? (viewTabs.find((viewTab) => viewTab.id !== view.id)?.id ?? null)
        : activeViewTabId

    if (view.isLinked) {
      updateDatabase.mutate(
        {
          config: getMergedDatabaseConfig(payload?.database.config, {
            linkedDatabaseViews: linkedDatabaseViews.filter(
              (linkedView) => getDatabaseLinkedViewKey(linkedView) !== view.id,
            ),
          }),
          databaseId,
        },
        {
          onSuccess: () => setSelectedActiveViewId(nextActiveViewId),
        },
      )
      return
    }

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
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    databaseId: activeDatabaseId,
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
    payload: activePayload,
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

  const databaseViewContext: DatabaseViewContextValue = {
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    activeViewTabId,
    activeVisibilityConfig,
    addableFilterFieldOptions,
    addableSortFieldOptions,
    addDatabaseProperty: commands.addDatabaseProperty,
    addChartView: commands.addChartView,
    addFormView: commands.addFormView,
    addGalleryView: commands.addGalleryView,
    addDraggedPageRow: commands.addDraggedPageRow,
    addKanbanView: commands.addKanbanView,
    addListView: commands.addListView,
    addLinkedDatabaseView,
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
    databaseConfig: activePayload?.database.config,
    databaseId: activeDatabaseId,
    databaseName: activePayload?.database.name,
    databasePageId: activePayload?.database.pageId,
    databaseWorkspaceId: activePayload?.database.workspaceId,
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
    hostDatabaseId: databaseId,
    hostDatabaseName: payload?.database.name,
    hostDatabaseWorkspaceId: payload?.database.workspaceId,
    hostViews: payload?.views ?? [],
    isAddingDatabaseProperty: addProperty.isPending,
    isAddingDatabaseRow: addRow.isPending,
    isAddingDatabaseView: addDatabaseView.isPending,
    isTimelineView,
    isFetchingNextPage: activeIsFetchingNextPage,
    linkedDatabaseViews,
    layoutSettings,
    titlePropertyLabel,
    showPageIconInTitle,
    onOpenPage,
    options: kanbanOptions,
    workspaceId,
    personOptions,
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
    views: activePayload?.views ?? [],
  }

  return {
    className: fullPage
      ? "database-block-shell database-block-shell-full"
      : "database-block-shell",
    context: databaseViewContext,
    databaseId,
    error: activeLinkedDatabaseView ? linkedError : error,
    isError: activeLinkedDatabaseView ? isLinkedError : isError,
    handleDatabaseBlockDragOver,
    handleDatabaseBlockDrop,
    isLoading:
      isLoading || Boolean(activeLinkedDatabaseView && isLoadingLinkedPayload),
    onDismissSetup,
    onSetupComplete,
    workspaceId,
    payload: activePayload,
    sourcePropertyDialog: null,
    setupMode: effectiveSetupMode,
    viewType: activeView?.type,
    pageId,
  }
}
