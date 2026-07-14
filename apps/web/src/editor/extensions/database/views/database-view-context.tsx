import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"

import type {
  DatabaseProperty,
  DatabaseRow,
  DatabaseView,
} from "@notelab/features/databases"
import {
  useDatabaseRealtime,
  type DatabasePresenceCollaborator,
} from "@notelab/features/databases"
import { useSession } from "@notelab/features/auth"

import type { DatabasePropertyValue } from "../core/utils"
import type {
  DatabasePropertyListItem,
  DatabaseSelectOption,
} from "./kanban/database-kanban-config"
import type {
  DatabaseSearchableMenuOption,
} from "./database-searchable-menu-items"
import type {
  DatabaseActiveFilter,
  DatabaseFilterUpdatePatch,
} from "./database-filter-menu"
import type {
  DatabaseActiveSort,
  DatabaseSortUpdatePatch,
} from "./database-sort-menu"
import type {
  DatabasePropertyFilterConfig,
  DatabaseConditionalColorConfig,
  DatabaseLinkedViewConfig,
  DatabaseSortConfig,
  DatabaseLayoutSettings,
  DatabaseNameColumnConfig,
} from "./database-view-config"
import type {
  DatabasePageDragPayload,
} from "../interactions/database-page-drop"
import type { DatabaseChartSettings } from "./chart/database-chart-config"
import type {
  SortableDatabaseItem,
} from "../interactions/database-item-utils"
import {
  DatabaseCellStateProvider,
  useActiveDatabaseCellKey,
} from "./database-cell-state"

export type DatabaseActiveConditionalColor = Omit<
  DatabaseConditionalColorConfig,
  "filter"
> & {
  filter: DatabaseActiveFilter
}

export type DatabaseViewTab = {
  id: string
  isLinked?: boolean
  name: string
  sourceDatabaseId?: string
  sourceDatabaseName?: string
  sourceViewId?: string
  type: string
}

export type DatabaseViewContextValue = {
  activeConditionalColors: DatabaseActiveConditionalColor[]
  activeDatabaseFilters: DatabaseActiveFilter[]
  activeDatabaseSorts: DatabaseActiveSort[]
  activeView: DatabaseView | null
  activeViewTabId: string | null
  activeVisibilityConfig: unknown
  addableFilterFieldOptions: DatabaseSearchableMenuOption[]
  addableSortFieldOptions: DatabaseSearchableMenuOption[]
  addDatabaseProperty: (type?: string, label?: string, position?: number) => void
  addDatabaseRow: (
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null
  ) => void
  addChartView: () => void
  addGalleryView: () => void
  addDraggedPageRow: (
    dragPayload: DatabasePageDragPayload,
    position: number
  ) => void | Promise<void>
  addKanbanView: () => void
  addListView: () => void
  addLinkedDatabaseView: (view: DatabaseLinkedViewConfig) => void
  addTableView: () => void
  addTimelineRow: (
    startAt: Date,
    endAt: Date,
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null
  ) => void
  addTimelineView: () => void
  canAddDatabaseFilter: boolean
  canAddDatabaseProperties?: boolean
  canAddDatabaseRows?: boolean
  canAddDatabaseViews?: boolean
  canAddDatabaseSort: boolean
  chartSettings: DatabaseChartSettings
  clearDatabaseFilter: () => void
  clearDatabaseSort: () => void
  copyDatabaseViewLink: () => void
  createDatabaseFilter: (field: string) => void
  createDatabaseSort: (field: string) => void
  databaseConfig?: unknown
  databaseId: string | null | undefined
  databaseName?: string
  databaseWorkspaceId?: string
  deleteDatabaseView: (view: DatabaseViewTab) => void
  duplicateDatabaseView: (view: DatabaseViewTab) => void
  draftDatabaseTitle: string
  draftViewTitle: string
  editable: boolean
  fetchNextPage: () => Promise<void>
  filteredItems: SortableDatabaseItem[]
  filterFieldOptions: DatabaseSearchableMenuOption[]
  filterPickerOpen: boolean
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>
  getDatabasePageDragPayload: (
    dataTransfer: DataTransfer | null
  ) => DatabasePageDragPayload | null
  groupOptions: DatabaseSelectOption[]
  groupProperty: DatabasePropertyListItem | null
  groupableProperties: DatabasePropertyListItem[]
  hasDatabasePageDragPayload: (dataTransfer: DataTransfer | null) => boolean
  hasNextPage: boolean
  headerMenusEnabled?: boolean
  hostDatabaseId: string | null | undefined
  hostDatabaseName?: string
  hostDatabaseWorkspaceId?: string
  hostViews: DatabaseView[]
  isAddingDatabaseProperty: boolean
  isAddingDatabaseRow: boolean
  isAddingDatabaseView: boolean
  isTimelineView: boolean
  isFetchingNextPage: boolean
  items: DatabaseRow[]
  linkedDatabaseViews: DatabaseLinkedViewConfig[]
  layoutSettings: DatabaseLayoutSettings
  onOpenPage?: (
    pageId: string,
    options?: { databaseId?: string | null },
  ) => void
  options: DatabaseSelectOption[]
  workspaceId?: string | null
  personOptions: Array<{ id: string; name: string; suffix?: string }>
  properties: DatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  removeDatabaseFilter: (index: number) => void
  removeDatabaseSort: (index: number) => void
  renameDatabaseProperty: (databasePropertyId: string, name: string) => void
  reorderDatabaseFilters: (filterIds: string[]) => void
  saveDatabaseTitle: (nextTitle: string) => void
  saveDatabaseEmoji: (nextEmoji: string) => void
  saveDatabaseViewTitle: (nextTitle: string) => void
  saveDatabaseConditionalColors: (
    nextConditionalColors: DatabaseConditionalColorConfig[]
  ) => void
  saveDatabaseFilters: (nextFilters: DatabasePropertyFilterConfig[]) => void
  saveDatabasePropertyOrder: (propertyIds: string[]) => void
  saveDatabaseSorts: (nextSorts: DatabaseSortConfig[]) => Promise<unknown>
  savePropertyValue: (
    rowId: string,
    propertyId: string,
    propertyType: string,
    currentValue: DatabasePropertyValue,
    nextValue: DatabasePropertyValue
  ) => void
  setActiveViewId: Dispatch<SetStateAction<string | null>>
  setDraftDatabaseTitle: Dispatch<SetStateAction<string>>
  setDraftViewTitle: Dispatch<SetStateAction<string>>
  setFilterPickerOpen: Dispatch<SetStateAction<boolean>>
  setViewDateProperty: (datePropertyId: string | null) => void
  setupTimelineDateProperty: () => void
  setViewGroupProperty: (groupPropertyId: string | null) => void
  setViewType: (
    type: "table" | "kanban" | "timeline" | "chart" | "gallery" | "list"
  ) => void
  timelineDateProperties: DatabasePropertyListItem[]
  timelineDateProperty: DatabasePropertyListItem | null
  setSortPickerOpen: Dispatch<SetStateAction<boolean>>
  showExpandButton: boolean
  showFilterPill: boolean
  showPageIconInTitle: boolean
  showPropertyTitles: boolean
  showSortPill: boolean
  showTitle: boolean
  onShowTitleChange?: (showTitle: boolean) => void
  sortFieldOptions: DatabaseSearchableMenuOption[]
  sortPickerOpen: boolean
  sortedItems: SortableDatabaseItem[]
  titlePropertyLabel: string
  toggleFilterPillVisibility: () => void
  togglePropertyTitles: () => void
  togglePropertyVisibility: (propertyId: string) => void
  toggleSortPillVisibility: () => void
  updateDatabasePropertyConfig: (
    databasePropertyId: string,
    config: unknown
  ) => Promise<unknown>
  updateDatabaseChartSettings: (
    settings: Partial<DatabaseChartSettings>
  ) => void
  updateDatabaseLayoutSettings: (
    settings: Partial<DatabaseLayoutSettings>
  ) => void
  updateNameColumnConfig?: (
    config: DatabaseNameColumnConfig
  ) => Promise<unknown> | void
  updateDatabaseFilter: (index: number, patch: DatabaseFilterUpdatePatch) => void
  updateDatabaseSort: (index: number, patch: DatabaseSortUpdatePatch) => void
  visibleProperties: DatabaseProperty[]
  visiblePropertyCount: number
  viewTabs: DatabaseViewTab[]
  views: DatabaseView[]
}

const DatabaseViewContext = createContext<DatabaseViewContextValue | null>(null)
const DatabaseRealtimeContext = createContext<{
  cellPresenceByKey: Record<string, DatabasePresenceCollaborator[]>
  status: "connected" | "connecting" | "disconnected" | "offline"
}>({ cellPresenceByKey: {}, status: "offline" })

export function DatabaseViewProvider({
  children,
  value,
}: {
  children: ReactNode
  value: DatabaseViewContextValue
}) {
  return (
    <DatabaseViewContext.Provider value={value}>
      <DatabaseCellStateProvider>
        <DatabaseRealtimeStateProvider value={value}>
          {children}
        </DatabaseRealtimeStateProvider>
      </DatabaseCellStateProvider>
    </DatabaseViewContext.Provider>
  )
}

function DatabaseRealtimeStateProvider({
  children,
  value,
}: {
  children: ReactNode
  value: DatabaseViewContextValue
}) {
  const { data: session } = useSession()
  const activeKey = useActiveDatabaseCellKey()
  const separatorIndex = activeKey?.indexOf(":") ?? -1
  const pageId = separatorIndex >= 0 ? activeKey!.slice(0, separatorIndex) : null
  const columnKey = separatorIndex >= 0
    ? activeKey!.slice(separatorIndex + 1)
    : null
  const rowId = pageId
    ? value.items.find((row) => row.pageId === pageId)?.id ?? null
    : null
  const presence = rowId && columnKey
    ? {
        columnKey,
        rowId,
        viewId: value.activeView?.id ?? null,
      }
    : null
  const realtime = useDatabaseRealtime(value.databaseId, {
    enabled: Boolean(session?.user),
    presence,
    publishPresence: value.editable,
  })

  return (
    <DatabaseRealtimeContext.Provider value={realtime}>
      {children}
    </DatabaseRealtimeContext.Provider>
  )
}

export function useDatabaseViewContext() {
  const value = useContext(DatabaseViewContext)

  if (!value) {
    throw new Error("useDatabaseViewContext must be used inside DatabaseViewProvider")
  }

  return value
}

export function useDatabaseRealtimeState() {
  return useContext(DatabaseRealtimeContext)
}
