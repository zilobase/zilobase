import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react"

import { useSession } from "@notelab/features/auth"
import {
  useAddDatabaseView,
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useDatabase,
  databaseQueryOptions,
  type DatabasePayload,
  useDeleteDatabaseView,
  useUpdateDatabase,
  useUpdateDatabaseView,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
} from "@notelab/features/databases"
import { useNotelabFeatures } from "@notelab/features"
import {
  usePage,
  usePagePersonAccessTargets,
} from "@notelab/features/pages"
import { ArrowRight, Columns3, Link2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
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

type SourcePropertyMode = "duplicate" | "match"

type SourcePropertyConflict = {
  name: string
  sourceType: string
  targetType: string
}

type PendingSourcePropertyMode = {
  conflicts: SourcePropertyConflict[]
  sourceDatabaseName: string
  targetDatabaseName: string
}

const getPropertyNameKey = (name: string) => name.trim().toLowerCase()

function getSourcePropertyConflicts(
  sourcePayload: DatabasePayload,
  targetPayload: DatabasePayload,
) {
  const targetPropertiesByName = new Map(
    targetPayload.properties.map((property) => [
      getPropertyNameKey(property.property.name),
      property,
    ]),
  )

  return sourcePayload.properties.flatMap((sourceProperty) => {
    const targetProperty = targetPropertiesByName.get(
      getPropertyNameKey(sourceProperty.property.name),
    )

    if (
      !targetProperty ||
      targetProperty.property.id === sourceProperty.property.id
    ) {
      return []
    }

    return [
      {
        name: sourceProperty.property.name,
        sourceType: sourceProperty.property.type,
        targetType: targetProperty.property.type,
      },
    ]
  })
}

export function useDatabaseViewController({
  activeViewId: requestedActiveViewId,
  databaseId,
  editable = true,
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
  const { apiFetch, queryClient } = useNotelabFeatures()
  const [pendingSourcePropertyMode, setPendingSourcePropertyMode] =
    useState<PendingSourcePropertyMode | null>(null)
  const sourcePropertyModeResolverRef = useRef<
    ((mode: SourcePropertyMode | null) => void) | null
  >(null)
  const updateDatabase = useUpdateDatabase()
  const updateDatabaseView = useUpdateDatabaseView()
  const addDatabaseView = useAddDatabaseView()
  const deleteDatabaseView = useDeleteDatabaseView()
  const addProperty = useAddDatabaseProperty()
  const updateProperty = useUpdateDatabaseProperty()
  const addRow = useAddDatabaseRow()
  const updateValue = useUpdateDatabasePropertyValue()
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
    [payload?.database.config]
  )
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
  const requestedViewId =
    requestedActiveViewId &&
    viewTabs.some((view) => view.id === requestedActiveViewId)
      ? requestedActiveViewId
      : null
  const resolvedActiveViewId = isControlledActiveView
    ? requestedViewId ?? viewTabs[0]?.id ?? null
    : activeViewId
  const setupDismissed = getDatabaseSetupDismissed(payload?.database.config)
  const hasDatabaseSetupContent = Boolean(
    payload &&
      (payload.properties.length > 0 ||
        (payload.rowCount ?? payload.rows.length) > 0 ||
        linkedDatabaseViews.length > 0),
  )
  const effectiveSetupMode = Boolean(
    editable && payload && !setupDismissed && (setupMode || !hasDatabaseSetupContent),
  )
  const activeLinkedDatabaseView = useMemo(
    () =>
      linkedDatabaseViews.find(
        (linkedView) =>
          getDatabaseLinkedViewKey(linkedView) === resolvedActiveViewId
      ) ?? null,
    [linkedDatabaseViews, resolvedActiveViewId]
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
                isControlledActiveView
                  ? resolvedActiveViewId
                  : currentViewId
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
    isTimelineView,
    items,
    kanbanGroupProperty,
    kanbanOptions,
    timelineDateProperties,
    timelineDateProperty,
    personOptions,
    properties,
    propertyValuesByKey,
    showPageIconInTitle,
    showPropertyTitles,
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
        : viewTabs[0]?.id ?? null
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
    (nextDatabaseId: string, databaseViewId: string, fallbackConfig: unknown) => {
      const configKey = `${nextDatabaseId}:${databaseViewId}`

      if (latestViewConfigRef.current.has(configKey)) {
        return latestViewConfigRef.current.get(configKey)
      }

      return (
        activePayload?.views.find((view) => view.id === databaseViewId)?.config ??
        fallbackConfig
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

  const resolvePendingSourcePropertyMode = useCallback(
    (mode: SourcePropertyMode | null) => {
      sourcePropertyModeResolverRef.current?.(mode)
      sourcePropertyModeResolverRef.current = null
      setPendingSourcePropertyMode(null)
    },
    [],
  )

  const getSourcePropertyMode = useCallback(
    async (dragPayload: DatabasePageDragPayload) => {
      if (!dragPayload.databaseId || !activePayload) {
        return "duplicate" as const
      }

      let sourcePayload: DatabasePayload | null = null

      try {
        sourcePayload = await queryClient.ensureQueryData(
          databaseQueryOptions(apiFetch, dragPayload.databaseId, {
            schemaOnly: true,
          }),
        )
      } catch {
        toast.error("Couldn't inspect source database properties.")
        return null
      }

      if (!sourcePayload) {
        return null
      }

      const conflicts = getSourcePropertyConflicts(sourcePayload, activePayload)

      if (conflicts.length === 0) {
        return "duplicate" as const
      }

      sourcePropertyModeResolverRef.current?.(null)

      return new Promise<SourcePropertyMode | null>((resolve) => {
        sourcePropertyModeResolverRef.current = resolve
        setPendingSourcePropertyMode({
          conflicts,
          sourceDatabaseName: sourcePayload.database.name,
          targetDatabaseName: activePayload.database.name,
        })
      })
    },
    [activePayload, apiFetch, queryClient],
  )

  useEffect(
    () => () => {
      sourcePropertyModeResolverRef.current?.(null)
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
        (existingView) => getDatabaseLinkedViewKey(existingView) === linkedViewKey
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
          onSuccess: () => setSelectedActiveViewId(`linked:${linkedViewId}`),
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

          setSelectedActiveViewId(addedView?.id ?? null)
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
          onSuccess: () => setSelectedActiveViewId(nextActiveViewId),
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
        onSuccess: () => setSelectedActiveViewId(nextActiveViewId),
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
    timelineDateProperty,
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
    addTimelineRow: commands.addTimelineRow,
    addTimelineView: commands.addTimelineView,
    canAddDatabaseFilter,
    canAddDatabaseProperties: true,
    canAddDatabaseRows: true,
    canAddDatabaseViews: true,
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
    togglePropertyVisibility: commands.togglePropertyVisibility,
    toggleFilterPillVisibility: commands.toggleFilterPillVisibility,
    togglePropertyTitles: commands.togglePropertyTitles,
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
    error: activeLinkedDatabaseView ? linkedError : error,
    isError: activeLinkedDatabaseView ? isLinkedError : isError,
    handleDatabaseBlockDragOver,
    handleDatabaseBlockDrop,
    isLoading: isLoading || Boolean(activeLinkedDatabaseView && isLoadingLinkedPayload),
    onDismissSetup,
    onSetupComplete,
    workspaceId,
    payload: activePayload,
    sourcePropertyDialog: pendingSourcePropertyMode ? (
      <SourcePropertyModeDialog
        conflicts={pendingSourcePropertyMode.conflicts}
        onChoose={resolvePendingSourcePropertyMode}
        sourceDatabaseName={pendingSourcePropertyMode.sourceDatabaseName}
        targetDatabaseName={pendingSourcePropertyMode.targetDatabaseName}
      />
    ) : null,
    setupMode: effectiveSetupMode,
    viewType: activeView?.type,
    pageId,
  }
}

function SourcePropertyModeDialog({
  conflicts,
  onChoose,
  sourceDatabaseName,
  targetDatabaseName,
}: PendingSourcePropertyMode & {
  onChoose: (mode: SourcePropertyMode | null) => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onChoose(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Match properties?</DialogTitle>
          <DialogDescription>
            Some properties from {sourceDatabaseName} already exist in{" "}
            {targetDatabaseName}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Same-name properties
            </div>
            <div className="grid gap-2">
              {conflicts.slice(0, 4).map((conflict) => (
                <div
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs"
                  key={`${conflict.name}:${conflict.sourceType}:${conflict.targetType}`}
                >
                  <PropertyPill label={conflict.name} type={conflict.sourceType} />
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <PropertyPill label={conflict.name} type={conflict.targetType} />
                </div>
              ))}
              {conflicts.length > 4 ? (
                <div className="text-xs text-muted-foreground">
                  +{conflicts.length - 4} more
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <ModeButton
              description="Use the existing target columns and copy this page's values into them."
              icon={Link2}
              label="Match existing"
              onClick={() => onChoose("match")}
            />
            <ModeButton
              description="Add the source columns too, keeping both sets of properties."
              icon={Columns3}
              label="Add as separate"
              onClick={() => onChoose("duplicate")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onChoose(null)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PropertyPill({ label, type }: { label: string; type: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-2 py-1.5">
      <div className="truncate font-medium">{label}</div>
      <div className="truncate text-muted-foreground">{type}</div>
    </div>
  )
}

function ModeButton({
  description,
  icon: Icon,
  label,
  onClick,
}: {
  description: string
  icon: typeof Link2
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "grid gap-2 rounded-lg border bg-background p-3 text-left transition-colors",
        "hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="text-xs leading-5 text-muted-foreground">
        {description}
      </span>
    </button>
  )
}
