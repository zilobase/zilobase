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

export type DatabaseViewProps = {
  databaseId: string | null | undefined
  editable?: boolean
  fullPage?: boolean
  onOpenPage?: (pageId: string) => void
  organizationId?: string | null
  showExpandButton?: boolean
  showTitle?: boolean
}

export function useDatabaseViewController({
  databaseId,
  editable = true,
  fullPage = false,
  onOpenPage,
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
  const addProperty = useAddDatabaseProperty()
  const updateProperty = useUpdateDatabaseProperty()
  const addRow = useAddDatabaseRow(organizationId)
  const updateValue = useUpdateDatabasePropertyValue()
  const { data: payload, isLoading } = useDatabase(databaseId)
  const { data: session } = useSession()
  const { data: accessTargets } = useWorkspacePersonAccessTargets(
    payload?.database.pageId
  )
  const [draftDatabaseTitle, setDraftDatabaseTitle] = useState("New database")
  const [draftViewTitle, setDraftViewTitle] = useState("Table")
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [activePropertyValueKey, setActivePropertyValueKey] = useState<string | null>(null)
  const [showSortPill, setShowSortPill] = useState(true)
  const [sortPickerOpen, setSortPickerOpen] = useState(false)

  const viewModel = useMemo(
    () =>
      getDatabaseViewModel({
        accessTargets,
        activeViewId,
        currentUserId: session?.user?.id,
        payload,
      }),
    [accessTargets, activeViewId, payload, session?.user?.id]
  )
  const {
    activeDatabaseSorts,
    activeView,
    activeVisibilityConfig,
    addableSortFieldOptions,
    canAddDatabaseSort,
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
    if (payload?.database.name) {
      setDraftDatabaseTitle(payload.database.name)
    }
  }, [payload?.database.id, payload?.database.name])

  useEffect(() => {
    if (!payload?.views.length) {
      setActiveViewId(null)
      return
    }

    if (!activeViewId || !payload.views.some((view) => view.id === activeViewId)) {
      setActiveViewId(payload.views[0].id)
    }
  }, [activeViewId, payload?.views])

  useEffect(() => {
    if (activeView?.name) {
      setDraftViewTitle(activeView.name)
    }
  }, [activeView?.id, activeView?.name])

  useEffect(() => {
    if (activeDatabaseSorts.length === 0) {
      setShowSortPill(false)
    }
  }, [activeDatabaseSorts.length])

  const commands = getDatabaseViewCommands({
    activeDatabaseSorts,
    activeView,
    databaseId,
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
    payload,
    properties,
    setActiveViewId,
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
    activeDatabaseSorts,
    activeView,
    activeVisibilityConfig,
    addableSortFieldOptions,
    addDatabaseProperty: commands.addDatabaseProperty,
    addDraggedPageRow: commands.addDraggedPageRow,
    addKanbanView: commands.addKanbanView,
    addDatabaseRow: commands.addDatabaseRow,
    addTableView: commands.addTableView,
    canAddDatabaseSort,
    propertyValuesByKey,
    clearDatabaseSort: commands.clearDatabaseSort,
    copyDatabaseViewLink: commands.copyDatabaseViewLink,
    createDatabaseSort: commands.createDatabaseSort,
    databaseConfig: payload?.database.config,
    databaseId,
    databaseName: payload?.database.name,
    databaseOrganizationId: payload?.database.organizationId,
    draftPropertyValues,
    draftDatabaseTitle,
    draftViewTitle,
    editable,
    getDatabasePageDragPayload,
    groupProperty: kanbanGroupProperty,
    hasDatabasePageDragPayload,
    isAddingDatabaseProperty: addProperty.isPending,
    isAddingDatabaseRow: addRow.isPending,
    isAddingDatabaseView: addDatabaseView.isPending,
    titlePropertyLabel,
    showPageIconInTitle,
    onOpenPage,
    options: kanbanOptions,
    organizationId,
    personOptions,
    properties,
    removeDatabaseSort: commands.removeDatabaseSort,
    renameDatabaseProperty: commands.renameDatabaseProperty,
    items,
    savePropertyValue: commands.savePropertyValue,
    saveDatabaseTitle: commands.saveDatabaseTitle,
    saveDatabaseSorts: commands.saveDatabaseSorts,
    saveDatabaseViewTitle: commands.saveDatabaseViewTitle,
    setActivePropertyValueKey,
    setActiveViewId,
    setDraftPropertyValues,
    setDraftDatabaseTitle,
    setDraftViewTitle,
    setSortPickerOpen,
    showExpandButton,
    showSortPill,
    showTitle,
    sortFieldOptions,
    sortPickerOpen,
    sortedItems,
    togglePropertyVisibility: commands.togglePropertyVisibility,
    toggleSortPillVisibility: commands.toggleSortPillVisibility,
    updateDatabasePropertyConfig: commands.updateDatabasePropertyConfig,
    updateDatabaseSort: commands.updateDatabaseSort,
    visibleProperties,
    visiblePropertyCount,
    views: payload?.views ?? [],
  }

  return {
    className: fullPage
      ? "database-block-shell database-block-shell-full"
      : "database-block-shell",
    context: databaseViewContext,
    databaseId,
    handleDatabaseBlockDragOver,
    handleDatabaseBlockDrop,
    isLoading,
    payload,
    viewType: activeView?.type,
  }
}
