import {
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import { useSession } from "@notelab/features/auth"
import {
  useAddDatabaseView,
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useDatabase,
  useDeleteDatabaseView,
  useUpdateDatabase,
  useUpdateDatabaseView,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
} from "@notelab/features/databases"
import { useWorkspacePersonAccessTargets } from "@notelab/features/workspaces"

import {
  getDatabasePageDragPayload,
  hasDatabasePageDragPayload,
} from "./database-page-drop"
import type { DatabaseViewContextValue } from "./database-view-context"
import { type DatabasePropertyValue } from "../utils"
import { getDatabaseViewCommands } from "./database-view-commands"
import { getDatabaseViewModel } from "./database-view-model"
import {
  getDatabaseLinkedViewKey,
  getDatabaseLinkedViews,
  getMergedDatabaseConfig,
  type DatabaseLinkedViewConfig,
} from "./database-view-config"

export type DatabaseViewProps = {
  databaseId: string | null | undefined
  editable?: boolean
  fullPage?: boolean
  onOpenPage?: (pageId: string) => void
  onShowTitleChange?: (showTitle: boolean) => void
  organizationId?: string | null
  showExpandButton?: boolean
  showTitle?: boolean
}

export function useDatabaseViewController({
  databaseId,
  editable = true,
  fullPage = false,
  onOpenPage,
  onShowTitleChange,
  organizationId,
  showExpandButton = false,
  showTitle = true,
}: DatabaseViewProps) {
  const [draftPropertyValues, setDraftPropertyValues] = useState<
    Record<string, DatabasePropertyValue>
  >({})
  const updateDatabase = useUpdateDatabase()
  const updateDatabaseView = useUpdateDatabaseView()
  const addDatabaseView = useAddDatabaseView()
  const deleteDatabaseView = useDeleteDatabaseView()
  const addProperty = useAddDatabaseProperty()
  const updateProperty = useUpdateDatabaseProperty()
  const addRow = useAddDatabaseRow(organizationId)
  const updateValue = useUpdateDatabasePropertyValue()
  const { data: payload, isLoading } = useDatabase(databaseId)
  const [draftDatabaseTitle, setDraftDatabaseTitle] = useState("New database")
  const [draftViewTitle, setDraftViewTitle] = useState("Table")
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [activePropertyValueKey, setActivePropertyValueKey] = useState<string | null>(null)
  const [showFilterPill, setShowFilterPill] = useState(true)
  const [showSortPill, setShowSortPill] = useState(true)
  const [filterPickerOpen, setFilterPickerOpen] = useState(false)
  const [sortPickerOpen, setSortPickerOpen] = useState(false)
  const linkedDatabaseViews = useMemo(
    () => getDatabaseLinkedViews(payload?.database.config),
    [payload?.database.config]
  )
  const activeLinkedDatabaseView = useMemo(
    () =>
      linkedDatabaseViews.find(
        (linkedView) => getDatabaseLinkedViewKey(linkedView) === activeViewId
      ) ?? null,
    [activeViewId, linkedDatabaseViews]
  )
  const {
    data: linkedPayload,
    isLoading: isLoadingLinkedPayload,
  } = useDatabase(activeLinkedDatabaseView?.databaseId)
  const activePayload = activeLinkedDatabaseView ? linkedPayload : payload
  const activeDatabaseId = activeLinkedDatabaseView?.databaseId ?? databaseId
  const activeViewLookupId = activeLinkedDatabaseView?.viewId ?? activeViewId
  const { data: session } = useSession()
  const { data: accessTargets } = useWorkspacePersonAccessTargets(
    activePayload?.database.pageId
  )
  const activeViewTabId = activeLinkedDatabaseView
    ? getDatabaseLinkedViewKey(activeLinkedDatabaseView)
    : activeViewId
  const viewTabs = useMemo(
    () => [
      ...(payload?.views ?? []).map((view) => ({
        id: view.id,
        name: view.name,
        type: view.type,
      })),
      ...linkedDatabaseViews.map((linkedView) => ({
        id: getDatabaseLinkedViewKey(linkedView),
        isLinked: true,
        name: linkedView.viewName,
        sourceDatabaseId: linkedView.databaseId,
        sourceDatabaseName: linkedView.databaseName,
        sourceViewId: linkedView.viewId,
        type: linkedView.viewType,
      })),
    ],
    [linkedDatabaseViews, payload?.views]
  )

  const viewModel = useMemo(
    () =>
      getDatabaseViewModel({
        accessTargets,
        activeViewId: activeViewLookupId,
        currentUserId: session?.user?.id,
        payload: activePayload,
      }),
    [accessTargets, activePayload, activeViewLookupId, session?.user?.id]
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
    filterFieldOptions,
    filterValueOptionsByField,
    filteredItems,
    groupOptions,
    groupProperty,
    groupableProperties,
    isKanbanView,
    items,
    kanbanGroupProperty,
    kanbanOptions,
    personOptions,
    properties,
    propertyValuesByKey,
    showPageIconInTitle,
    sortFieldOptions,
    sortedItems,
    titlePropertyLabel,
    visibleProperties,
    visiblePropertyCount,
  } = viewModel
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
    if (viewTabs.length === 0) {
      setActiveViewId(null)
      return
    }

    if (!activeViewId || !viewTabs.some((view) => view.id === activeViewId)) {
      setActiveViewId(viewTabs[0]?.id ?? null)
    }
  }, [activeViewId, viewTabs])

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

  const addLinkedDatabaseView = (linkedView: DatabaseLinkedViewConfig) => {
    if (!databaseId) {
      return
    }

    const linkedViewKey = getDatabaseLinkedViewKey(linkedView)

    if (
      linkedDatabaseViews.some(
        (existingView) => getDatabaseLinkedViewKey(existingView) === linkedViewKey
      )
    ) {
      setActiveViewId(linkedViewKey)
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
        onSuccess: () => setActiveViewId(linkedViewKey),
      }
    )
  }

  const duplicateDatabaseView = (view: DatabaseViewContextValue["viewTabs"][number]) => {
    if (!databaseId || addDatabaseView.isPending || updateDatabase.isPending) {
      return
    }

    if (view.isLinked) {
      const sourceLinkedView = linkedDatabaseViews.find(
        (linkedView) => getDatabaseLinkedViewKey(linkedView) === view.id
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
          onSuccess: () => setActiveViewId(`linked:${linkedViewId}`),
        }
      )
      return
    }

    const sourceView = (payload?.views ?? []).find(
      (databaseView) => databaseView.id === view.id
    )

    if (!sourceView) {
      return
    }

    const existingViewIds = new Set(
      (payload?.views ?? []).map((databaseView) => databaseView.id)
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
            nextPayload.views.find((databaseView) => !existingViewIds.has(databaseView.id)) ??
            nextPayload.views.at(-1)

          setActiveViewId(addedView?.id ?? null)
        },
      }
    )
  }

  const deleteDatabaseViewByTab = (
    view: DatabaseViewContextValue["viewTabs"][number]
  ) => {
    if (!databaseId || deleteDatabaseView.isPending || updateDatabase.isPending) {
      return
    }

    if (viewTabs.length <= 1) {
      return
    }

    const nextActiveViewId =
      activeViewTabId === view.id
        ? viewTabs.find((viewTab) => viewTab.id !== view.id)?.id ?? null
        : activeViewTabId

    if (view.isLinked) {
      updateDatabase.mutate(
        {
          config: getMergedDatabaseConfig(payload?.database.config, {
            linkedDatabaseViews: linkedDatabaseViews.filter(
              (linkedView) => getDatabaseLinkedViewKey(linkedView) !== view.id
            ),
          }),
          databaseId,
        },
        {
          onSuccess: () => setActiveViewId(nextActiveViewId),
        }
      )
      return
    }

    deleteDatabaseView.mutate(
      {
        databaseId,
        databaseViewId: view.id,
      },
      {
        onSuccess: () => setActiveViewId(nextActiveViewId),
      }
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
    mutations: {
      addDatabaseView,
      addProperty,
      addRow,
      updateDatabase,
      updateDatabaseView,
      updateProperty,
      updateValue,
    },
    payload: activePayload,
    properties,
    setActiveViewId,
    setFilterPickerOpen,
    setShowFilterPill,
    setShowSortPill,
    setSortPickerOpen,
  })

  const handleDatabaseBlockDragOver = (
    event: ReactDragEvent<HTMLDivElement>
  ) => {
    if (!hasDatabasePageDragPayload(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }

  const handleDatabaseBlockDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const dragPayload = getDatabasePageDragPayload(event.dataTransfer)

    if (!dragPayload) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    commands.addDraggedPageRow(dragPayload, items.length)
  }

  const databaseViewContext: DatabaseViewContextValue = {
    activePropertyValueKey,
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    activeViewTabId,
    activeVisibilityConfig,
    addableFilterFieldOptions,
    addableSortFieldOptions,
    addDatabaseProperty: commands.addDatabaseProperty,
    addDraggedPageRow: commands.addDraggedPageRow,
    addKanbanView: commands.addKanbanView,
    addLinkedDatabaseView,
    addDatabaseRow: commands.addDatabaseRow,
    addTableView: commands.addTableView,
    canAddDatabaseFilter,
    canAddDatabaseSort,
    propertyValuesByKey,
    clearDatabaseFilter: commands.clearDatabaseFilter,
    clearDatabaseSort: commands.clearDatabaseSort,
    copyDatabaseViewLink: commands.copyDatabaseViewLink,
    createDatabaseFilter: commands.createDatabaseFilter,
    createDatabaseSort: commands.createDatabaseSort,
    databaseConfig: activePayload?.database.config,
    databaseId: activeDatabaseId,
    databaseName: activePayload?.database.name,
    databaseOrganizationId: activePayload?.database.organizationId,
    deleteDatabaseView: deleteDatabaseViewByTab,
    duplicateDatabaseView,
    draftPropertyValues,
    draftDatabaseTitle,
    draftViewTitle,
    editable,
    filterFieldOptions,
    filterPickerOpen,
    filterValueOptionsByField,
    filteredItems,
    getDatabasePageDragPayload,
    groupOptions,
    groupProperty,
    groupableProperties,
    hasDatabasePageDragPayload,
    hostDatabaseId: databaseId,
    hostDatabaseName: payload?.database.name,
    hostDatabaseOrganizationId: payload?.database.organizationId,
    hostViews: payload?.views ?? [],
    isAddingDatabaseProperty: addProperty.isPending,
    isAddingDatabaseRow: addRow.isPending,
    isAddingDatabaseView: addDatabaseView.isPending,
    linkedDatabaseViews,
    titlePropertyLabel,
    showPageIconInTitle,
    onOpenPage,
    options: kanbanOptions,
    organizationId,
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
    saveDatabaseConditionalColors: commands.saveDatabaseConditionalColors,
    saveDatabaseFilters: commands.saveDatabaseFilters,
    saveDatabaseSorts: commands.saveDatabaseSorts,
    saveDatabaseViewTitle: commands.saveDatabaseViewTitle,
    setActivePropertyValueKey,
    setActiveViewId,
    setDraftPropertyValues,
    setDraftDatabaseTitle,
    setDraftViewTitle,
    setFilterPickerOpen,
    setViewGroupProperty: commands.setViewGroupProperty,
    setViewType: commands.setViewType,
    setSortPickerOpen,
    showExpandButton,
    showFilterPill,
    showSortPill,
    showTitle,
    onShowTitleChange,
    sortFieldOptions,
    sortPickerOpen,
    sortedItems,
    togglePropertyVisibility: commands.togglePropertyVisibility,
    toggleFilterPillVisibility: commands.toggleFilterPillVisibility,
    toggleSortPillVisibility: commands.toggleSortPillVisibility,
    updateDatabasePropertyConfig: commands.updateDatabasePropertyConfig,
    updateDatabaseFilter: commands.updateDatabaseFilter,
    updateDatabaseSort: commands.updateDatabaseSort,
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
    handleDatabaseBlockDragOver,
    handleDatabaseBlockDrop,
    isLoading: isLoading || Boolean(activeLinkedDatabaseView && isLoadingLinkedPayload),
    payload: activePayload,
    viewType: activeView?.type,
  }
}
