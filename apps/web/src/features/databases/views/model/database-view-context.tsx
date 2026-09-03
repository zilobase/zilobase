import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ComponentType,
  type Context,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"

import type {
  DatabaseProperty,
  DatabaseRow,
  DatabaseView,
} from "@zilobase/features/databases"
import {
  useDatabaseRealtime,
  type DatabasePresenceCollaborator,
} from "@zilobase/features/databases"
import { useSession } from "@zilobase/features/auth"

import type { DatabasePropertyValue } from "../../core/database-property-values"
import type {
  DatabasePropertyListItem,
  DatabaseSelectOption,
} from "../kanban/model/database-kanban-config"
import type {
  DatabaseSearchableMenuOption,
} from "../view/database-searchable-menu-items"
import type {
  DatabaseActiveFilter,
  DatabaseFilterUpdatePatch,
} from "../view/database-filter-menu"
import type {
  DatabaseActiveSort,
  DatabaseSortUpdatePatch,
} from "../view/database-sort-menu"
import type {
  DatabasePropertyFilterConfig,
  DatabaseConditionalColorConfig,
  DatabaseSortConfig,
  DatabaseLayoutSettings,
  DatabaseNameColumnConfig,
  DatabaseSubItemsSettings,
} from "./database-view-config"
import type {
  DatabasePageDragPayload,
} from "../../interactions/database-page-drop"
import type { DatabaseChartSettings } from "../chart/model/database-chart-config"
import type { DatabaseFormHeaderSettings } from "../form/model/database-form-header-config"
import type { DatabaseFormQuestionSettingsPatch } from "../form/model/database-form-question-config"
import type { DatabaseFormShareSettings } from "../form/model/database-form-share-config"
import type {
  SortableDatabaseItem,
} from "../../interactions/database-item-utils"
import {
  DatabaseCellStateProvider,
  useActiveDatabaseCellKey,
} from "./database-cell-state"
import {
  UndoHistoryScope,
  useOptionalUndoHistory,
  useUndoHistory,
} from "@/shared/shortcuts"
import { areSerializedPropertyValuesEqual } from "../../interactions/database-item-utils"

export type DatabaseActiveConditionalColor = Omit<
  DatabaseConditionalColorConfig,
  "filter"
> & {
  filter: DatabaseActiveFilter
}

export type DatabaseViewTab = {
  fallbackIcon?: ComponentType<{ className?: string }>
  icon?: string
  id: string
  name: string
  dataSourceId: string
  dataSourceName?: string
  sourceParentDatabaseId?: string
  type: string
}

export type DatabaseSourceViewSelection = {
  dataSourceId: string
  dataSourceName: string
  parentDatabaseId: string
  viewConfig?: unknown
  viewIcon?: string
  viewId: string
  viewName: string
  viewType: string
}

export type DatabaseViewProviderValue = {
  activeConditionalColors: DatabaseActiveConditionalColor[]
  activeDatabaseFilters: DatabaseActiveFilter[]
  activeDatabaseSorts: DatabaseActiveSort[]
  activeView: DatabaseView | null
  activeViewTabId: string | null
  activeVisibilityConfig: unknown
  addDataSource?: () => void
  addableFilterFieldOptions: DatabaseSearchableMenuOption[]
  addableSortFieldOptions: DatabaseSearchableMenuOption[]
  addDatabaseProperty: (type?: string, label?: string, position?: number) => void
  addDatabaseRow: (
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null,
    parentRowId?: string | null,
  ) => void
  addChartView: () => void
  addGalleryView: () => void
  addFormView: (hiddenPropertyIds: string[]) => void
  addDraggedPageRow: (
    dragPayload: DatabasePageDragPayload,
    position: number,
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null,
  ) => void | Promise<void>
  addKanbanView: () => void
  addListView: () => void
  linkDataSourceView: (view: DatabaseSourceViewSelection) => void
  unlinkDataSource?: (dataSourceId: string) => void
  addDataSourceView?: (
    dataSourceId: string,
    type:
      | "table"
      | "kanban"
      | "timeline"
      | "list"
      | "gallery"
      | "chart"
      | "form",
    mode?: "add" | "replace",
  ) => void
  replaceActiveViewSource?: (view: DatabaseSourceViewSelection) => void
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
  configureDataSources?: () => void
  copyDatabaseViewLink: () => void
  createDatabaseFilter: (field: string) => void
  createDatabaseSort: (field: string) => void
  dataSources?: Array<{
    config?: unknown
    hiddenViewCount?: number
    id: string
    name: string
    parentDatabaseId: string
    position?: number
    viewCount: number
  }>
  databaseConfig?: unknown
  databaseId: string | null | undefined
  databaseName?: string
  databasePageId?: string | null
  databaseWorkspaceId?: string
  realtimeEnabled?: boolean
  deleteDatabaseView: (
    view: DatabaseViewTab,
    options?: { deleteDataSource?: boolean },
  ) => void
  duplicateDatabaseView: (view: DatabaseViewTab) => void
  draftDatabaseTitle: string
  draftViewTitle: string
  editable: boolean
  fetchNextPage: () => Promise<void>
  filteredItems: SortableDatabaseItem[]
  filterFieldOptions: DatabaseSearchableMenuOption[]
  filterPickerOpen: boolean
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>
  fullPage?: boolean
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
  isAddingDataSource?: boolean
  isAddingDatabaseView: boolean
  isTimelineView: boolean
  isFetchingNextPage: boolean
  isRowComplete?: (row: DatabaseRow) => boolean
  items: DatabaseRow[]
  layoutSettings: DatabaseLayoutSettings
  newRowLabel?: string
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
  saveDatabaseViewIcon: (view: DatabaseViewTab, nextIcon: string) => void
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
  setRowComplete?: (row: DatabaseRow, complete: boolean) => void
  setViewDateProperty: (datePropertyId: string | null) => void
  setupTimelineDateProperty: () => void
  setViewGroupProperty: (groupPropertyId: string | null) => void
  setViewType: (
    type:
      | "table"
      | "kanban"
      | "timeline"
      | "chart"
      | "gallery"
      | "list"
      | "form"
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
  subItemChildRowIdsByParentId: Record<string, string[]>
  subItemDepthByRowId: Record<string, number>
  subItemParentRowIdsByRowId: Record<string, string[]>
  subItemsSettings: DatabaseSubItemsSettings
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
  updateDatabaseFormHeaderSettings?: (
    settings: Partial<DatabaseFormHeaderSettings>
  ) => void
  updateDatabaseFormQuestionSettings?: (
    propertyId: string,
    settings: DatabaseFormQuestionSettingsPatch
  ) => void
  updateDatabaseFormShareSettings?: (
    settings: Partial<DatabaseFormShareSettings>
  ) => void
  updateDatabaseSort: (index: number, patch: DatabaseSortUpdatePatch) => void
  updateDatabaseSubItemsSettings: (
    settings: Partial<DatabaseSubItemsSettings>
  ) => void
  visibleProperties: DatabaseProperty[]
  visiblePropertyCount: number
  viewTabs: DatabaseViewTab[]
  views: DatabaseView[]
}

const databaseDataKeys = [
  "activeConditionalColors", "activeDatabaseFilters", "activeDatabaseSorts",
  "addableFilterFieldOptions", "addableSortFieldOptions", "canAddDatabaseFilter",
  "canAddDatabaseProperties", "canAddDatabaseRows", "canAddDatabaseViews",
  "canAddDatabaseSort", "dataSources", "databaseConfig", "databaseId",
  "databaseName", "databasePageId", "databaseWorkspaceId", "editable",
  "filteredItems", "filterFieldOptions", "filterValueOptionsByField", "groupOptions",
  "groupProperty", "groupableProperties", "hasNextPage", "hostDatabaseId",
  "hostDatabaseName", "hostDatabaseWorkspaceId", "hostViews",
  "isAddingDatabaseProperty", "isAddingDatabaseRow", "isAddingDataSource",
  "isAddingDatabaseView", "isFetchingNextPage", "items", "options",
  "personOptions", "properties", "propertyValuesByKey", "realtimeEnabled",
  "sortFieldOptions", "sortedItems", "subItemChildRowIdsByParentId",
  "subItemDepthByRowId", "subItemParentRowIdsByRowId", "timelineDateProperties",
  "timelineDateProperty", "visibleProperties", "visiblePropertyCount", "views",
  "workspaceId",
] as const satisfies readonly (keyof DatabaseViewProviderValue)[]

const databaseUiKeys = [
  "activeView", "activeViewTabId", "activeVisibilityConfig", "chartSettings",
  "draftDatabaseTitle", "draftViewTitle", "filterPickerOpen", "fullPage",
  "headerMenusEnabled", "isTimelineView", "layoutSettings", "newRowLabel",
  "showExpandButton", "showFilterPill", "showPageIconInTitle", "showPropertyTitles",
  "showSortPill", "showTitle", "sortPickerOpen", "subItemsSettings",
  "titlePropertyLabel", "viewTabs",
] as const satisfies readonly (keyof DatabaseViewProviderValue)[]

const databaseActionKeys = [
  "addDataSource", "addDatabaseProperty", "addDatabaseRow", "addChartView",
  "addGalleryView", "addFormView", "addDraggedPageRow", "addKanbanView",
  "addListView", "linkDataSourceView", "unlinkDataSource", "addDataSourceView",
  "replaceActiveViewSource", "addTableView", "addTimelineRow", "addTimelineView",
  "clearDatabaseFilter", "clearDatabaseSort", "configureDataSources",
  "copyDatabaseViewLink", "createDatabaseFilter", "createDatabaseSort",
  "deleteDatabaseView", "duplicateDatabaseView", "fetchNextPage",
  "getDatabasePageDragPayload", "hasDatabasePageDragPayload", "isRowComplete",
  "onOpenPage", "removeDatabaseFilter", "removeDatabaseSort",
  "renameDatabaseProperty", "reorderDatabaseFilters", "saveDatabaseTitle",
  "saveDatabaseEmoji", "saveDatabaseViewIcon", "saveDatabaseViewTitle",
  "saveDatabaseConditionalColors", "saveDatabaseFilters", "saveDatabasePropertyOrder",
  "saveDatabaseSorts", "savePropertyValue", "setActiveViewId",
  "setDraftDatabaseTitle", "setDraftViewTitle", "setFilterPickerOpen",
  "setRowComplete", "setViewDateProperty", "setupTimelineDateProperty",
  "setViewGroupProperty", "setViewType", "setSortPickerOpen", "onShowTitleChange",
  "toggleFilterPillVisibility", "togglePropertyTitles", "togglePropertyVisibility",
  "toggleSortPillVisibility", "updateDatabasePropertyConfig",
  "updateDatabaseChartSettings", "updateDatabaseLayoutSettings",
  "updateNameColumnConfig", "updateDatabaseFilter", "updateDatabaseFormHeaderSettings",
  "updateDatabaseFormQuestionSettings", "updateDatabaseFormShareSettings",
  "updateDatabaseSort", "updateDatabaseSubItemsSettings",
] as const satisfies readonly (keyof DatabaseViewProviderValue)[]

type DatabaseDataKey = (typeof databaseDataKeys)[number]
type DatabaseUiKey = (typeof databaseUiKeys)[number]
type DatabaseActionKey = (typeof databaseActionKeys)[number]
type UnassignedDatabaseViewKey = Exclude<
  keyof DatabaseViewProviderValue,
  DatabaseDataKey | DatabaseUiKey | DatabaseActionKey
>
const unassignedDatabaseViewKeys: Record<UnassignedDatabaseViewKey, never> = {}
void unassignedDatabaseViewKeys

type DatabaseDataContextValue = Pick<DatabaseViewProviderValue, DatabaseDataKey>
type DatabaseUiContextValue = Pick<DatabaseViewProviderValue, DatabaseUiKey>
type DatabaseActionsContextValue = Pick<DatabaseViewProviderValue, DatabaseActionKey>

const DatabaseDataContext = createContext<DatabaseDataContextValue | null>(null)
const DatabaseUiContext = createContext<DatabaseUiContextValue | null>(null)
const DatabaseActionsContext = createContext<DatabaseActionsContextValue | null>(null)
const DatabaseRealtimeContext = createContext<{
  cellPresenceByKey: Record<string, DatabasePresenceCollaborator[]>
  status: "connected" | "connecting" | "disconnected" | "offline" | "unavailable"
}>({ cellPresenceByKey: {}, status: "offline" })

export function DatabaseViewProvider({
  children,
  value,
}: {
  children: ReactNode
  value: DatabaseViewProviderValue
}) {
  const parentUndoHistory = useOptionalUndoHistory()

  if (parentUndoHistory) {
    return (
      <UndoableDatabaseViewProvider value={value}>
        {children}
      </UndoableDatabaseViewProvider>
    )
  }

  return (
    <UndoHistoryScope resetKey={value.databaseId}>
      <UndoableDatabaseViewProvider value={value}>
        {children}
      </UndoableDatabaseViewProvider>
    </UndoHistoryScope>
  )
}

function cloneDatabasePropertyValue(value: DatabasePropertyValue) {
  return Array.isArray(value) ? [...value] : value
}

function UndoableDatabaseViewProvider({
  children,
  value,
}: {
  children: ReactNode
  value: DatabaseViewProviderValue
}) {
  const undoHistory = useUndoHistory()
  const undoableValue = useMemo<DatabaseViewProviderValue>(
    () => ({
      ...value,
      renameDatabaseProperty: (databasePropertyId, name) => {
        const currentName = value.properties.find(
          (property) => property.id === databasePropertyId
        )?.property.name

        if (
          undoHistory.shouldRecord() &&
          currentName !== undefined &&
          currentName !== name
        ) {
          undoHistory.pushAction({
            label: "Rename database property",
            redo: () => {
              value.renameDatabaseProperty(databasePropertyId, name)
            },
            undo: () => {
              value.renameDatabaseProperty(databasePropertyId, currentName)
            },
          })
        }

        value.renameDatabaseProperty(databasePropertyId, name)
      },
      saveDatabaseTitle: (nextTitle) => {
        const currentTitle = value.databaseName ?? ""

        if (undoHistory.shouldRecord() && currentTitle !== nextTitle) {
          undoHistory.pushAction({
            label: "Rename database",
            redo: () => {
              value.saveDatabaseTitle(nextTitle)
            },
            undo: () => {
              value.saveDatabaseTitle(currentTitle)
            },
          })
        }

        value.saveDatabaseTitle(nextTitle)
      },
      saveDatabaseViewTitle: (nextTitle) => {
        const currentTitle = value.activeView?.name ?? ""

        if (undoHistory.shouldRecord() && currentTitle !== nextTitle) {
          undoHistory.pushAction({
            label: "Rename database view",
            redo: () => {
              value.saveDatabaseViewTitle(nextTitle)
            },
            undo: () => {
              value.saveDatabaseViewTitle(currentTitle)
            },
          })
        }

        value.saveDatabaseViewTitle(nextTitle)
      },
      savePropertyValue: (
        rowId,
        propertyId,
        propertyType,
        currentValue,
        nextValue
      ) => {
        if (
          undoHistory.shouldRecord() &&
          !areSerializedPropertyValuesEqual(
            propertyType,
            currentValue,
            nextValue
          )
        ) {
          const previousValue = cloneDatabasePropertyValue(currentValue)
          const savedValue = cloneDatabasePropertyValue(nextValue)

          undoHistory.pushAction({
            label: "Update database value",
            redo: () => {
              value.savePropertyValue(
                rowId,
                propertyId,
                propertyType,
                previousValue,
                savedValue
              )
            },
            undo: () => {
              value.savePropertyValue(
                rowId,
                propertyId,
                propertyType,
                savedValue,
                previousValue
              )
            },
          })
        }

        value.savePropertyValue(
          rowId,
          propertyId,
          propertyType,
          currentValue,
          nextValue
        )
      },
    }),
    [undoHistory, value]
  )

  const dataValue = useStableContextSlice(undoableValue, databaseDataKeys)
  const uiValue = useStableContextSlice(undoableValue, databaseUiKeys)
  const actionsValue = useStableContextSlice(undoableValue, databaseActionKeys)

  return (
    <DatabaseDataContext.Provider value={dataValue}>
      <DatabaseUiContext.Provider value={uiValue}>
        <DatabaseActionsContext.Provider value={actionsValue}>
          <DatabaseCellStateProvider>
            <DatabaseRealtimeStateProvider value={undoableValue}>
              {children}
            </DatabaseRealtimeStateProvider>
          </DatabaseCellStateProvider>
        </DatabaseActionsContext.Provider>
      </DatabaseUiContext.Provider>
    </DatabaseDataContext.Provider>
  )
}

function DatabaseRealtimeStateProvider({
  children,
  value,
}: {
  children: ReactNode
  value: DatabaseViewProviderValue
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
  const realtime = useDatabaseRealtime(value.hostDatabaseId, {
    enabled: Boolean(
      session?.user &&
      value.hostDatabaseId &&
      value.hostDatabaseWorkspaceId &&
      value.realtimeEnabled !== false,
    ),
    presence,
    publishPresence: value.editable,
  })

  return (
    <DatabaseRealtimeContext.Provider value={realtime}>
      {children}
    </DatabaseRealtimeContext.Provider>
  )
}

function useStableContextSlice<
  Value extends object,
  Key extends keyof Value,
>(value: Value, keys: readonly Key[]): Pick<Value, Key> {
  const previous = useRef<Pick<Value, Key> | null>(null)
  const changed = !previous.current || keys.some(
    (key) => previous.current![key] !== value[key],
  )

  if (changed) {
    previous.current = Object.fromEntries(
      keys.map((key) => [key, value[key]]),
    ) as Pick<Value, Key>
  }

  return previous.current!
}

function useRequiredDatabaseContext<Value>(
  context: Context<Value | null>,
  hookName: string,
) {
  const value = useContext(context)

  if (!value) {
    throw new Error(`${hookName} must be used inside DatabaseViewProvider`)
  }

  return value
}

export function useDatabaseDataContext() {
  return useRequiredDatabaseContext(DatabaseDataContext, "useDatabaseDataContext")
}

export function useDatabaseUiContext() {
  return useRequiredDatabaseContext(DatabaseUiContext, "useDatabaseUiContext")
}

export function useDatabaseActionsContext() {
  return useRequiredDatabaseContext(DatabaseActionsContext, "useDatabaseActionsContext")
}

export function useDatabaseRealtimeState() {
  return useContext(DatabaseRealtimeContext)
}
