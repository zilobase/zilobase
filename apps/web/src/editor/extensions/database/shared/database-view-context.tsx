import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"

import type {
  DatabasePresenceCollaborator,
  DatabaseProperty,
  DatabaseRow,
  DatabaseView,
} from "@notelab/features/databases"

import type {
  DatabasePropertyValue,
} from "../utils"
import type {
  DatabasePropertyListItem,
  DatabaseSelectOption,
} from "../kanban/database-kanban-config"
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
} from "./database-view-config"
import type {
  DatabasePageDragPayload,
} from "./database-page-drop"
import type {
  SortableDatabaseItem,
} from "./database-item-utils"

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
  activePropertyValueKey: string | null
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
  addDraggedPageRow: (
    dragPayload: DatabasePageDragPayload,
    position: number
  ) => void
  addKanbanView: () => void
  addLinkedDatabaseView: (view: DatabaseLinkedViewConfig) => void
  addTableView: () => void
  canAddDatabaseFilter: boolean
  canAddDatabaseSort: boolean
  cellPresenceByKey: Record<string, DatabasePresenceCollaborator[]>
  clearDatabaseFilter: () => void
  clearDatabaseSort: () => void
  copyDatabaseViewLink: () => void
  createDatabaseFilter: (field: string) => void
  createDatabaseSort: (field: string) => void
  databaseConfig?: unknown
  databaseId: string | null | undefined
  databaseName?: string
  databaseOrganizationId?: string
  deleteDatabaseView: (view: DatabaseViewTab) => void
  duplicateDatabaseView: (view: DatabaseViewTab) => void
  draftDatabaseTitle: string
  draftPropertyValues: Record<string, DatabasePropertyValue>
  draftViewTitle: string
  editable: boolean
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
  hostDatabaseId: string | null | undefined
  hostDatabaseName?: string
  hostDatabaseOrganizationId?: string
  hostViews: DatabaseView[]
  isAddingDatabaseProperty: boolean
  isAddingDatabaseRow: boolean
  isAddingDatabaseView: boolean
  items: DatabaseRow[]
  linkedDatabaseViews: DatabaseLinkedViewConfig[]
  onOpenPage?: (pageId: string) => void
  options: DatabaseSelectOption[]
  organizationId?: string | null
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
  saveDatabaseSorts: (nextSorts: DatabaseSortConfig[]) => Promise<unknown>
  savePropertyValue: (
    rowId: string,
    propertyId: string,
    propertyType: string,
    currentValue: DatabasePropertyValue,
    nextValue: DatabasePropertyValue
  ) => void
  setActivePropertyValueKey: (key: string | null) => void
  setActiveViewId: Dispatch<SetStateAction<string | null>>
  setDraftDatabaseTitle: Dispatch<SetStateAction<string>>
  setDraftPropertyValues: Dispatch<
    SetStateAction<Record<string, DatabasePropertyValue>>
  >
  setDraftViewTitle: Dispatch<SetStateAction<string>>
  setFilterPickerOpen: Dispatch<SetStateAction<boolean>>
  setViewGroupProperty: (groupPropertyId: string | null) => void
  setViewType: (type: "table" | "kanban") => void
  setSortPickerOpen: Dispatch<SetStateAction<boolean>>
  showExpandButton: boolean
  showFilterPill: boolean
  showPageIconInTitle: boolean
  showSortPill: boolean
  showTitle: boolean
  onShowTitleChange?: (showTitle: boolean) => void
  sortFieldOptions: DatabaseSearchableMenuOption[]
  sortPickerOpen: boolean
  sortedItems: SortableDatabaseItem[]
  titlePropertyLabel: string
  toggleFilterPillVisibility: () => void
  togglePropertyVisibility: (propertyId: string) => void
  toggleSortPillVisibility: () => void
  updateDatabasePropertyConfig: (
    databasePropertyId: string,
    config: unknown
  ) => Promise<unknown>
  updateDatabaseFilter: (index: number, patch: DatabaseFilterUpdatePatch) => void
  updateDatabaseSort: (index: number, patch: DatabaseSortUpdatePatch) => void
  visibleProperties: DatabaseProperty[]
  visiblePropertyCount: number
  viewTabs: DatabaseViewTab[]
  views: DatabaseView[]
}

const DatabaseViewContext = createContext<DatabaseViewContextValue | null>(null)

export function DatabaseViewProvider({
  children,
  value,
}: {
  children: ReactNode
  value: DatabaseViewContextValue
}) {
  return (
    <DatabaseViewContext.Provider value={value}>
      {children}
    </DatabaseViewContext.Provider>
  )
}

export function useDatabaseViewContext() {
  const value = useContext(DatabaseViewContext)

  if (!value) {
    throw new Error("useDatabaseViewContext must be used inside DatabaseViewProvider")
  }

  return value
}
