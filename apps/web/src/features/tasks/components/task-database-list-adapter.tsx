import type { ReactNode } from "react"

import {
  DatabaseViewProvider,
  type DatabaseViewProviderValue,
} from "@/features/databases"

type UnsupportedTaskDatabaseAction =
  | "addChartView"
  | "addDatabaseProperty"
  | "addDraggedPageRow"
  | "addFormView"
  | "addGalleryView"
  | "addKanbanView"
  | "addListView"
  | "addTableView"
  | "addTimelineRow"
  | "addTimelineView"
  | "deleteDatabaseView"
  | "duplicateDatabaseView"
  | "getDatabasePageDragPayload"
  | "hasDatabasePageDragPayload"
  | "linkDataSourceView"
  | "renameDatabaseProperty"
  | "saveDatabaseEmoji"
  | "saveDatabaseTitle"
  | "saveDatabaseViewIcon"
  | "saveDatabaseViewTitle"
  | "setDraftDatabaseTitle"
  | "setDraftViewTitle"
  | "setViewDateProperty"
  | "setViewType"
  | "setupTimelineDateProperty"

type TaskDatabaseListValue = Omit<
  DatabaseViewProviderValue,
  UnsupportedTaskDatabaseAction
>

const ignoreUnsupportedAction = () => {}

export function TaskDatabaseListAdapter({
  children,
  value,
}: {
  children: ReactNode
  value: TaskDatabaseListValue
}) {
  return (
    <DatabaseViewProvider
      value={{
        ...value,
        addChartView: ignoreUnsupportedAction,
        addDatabaseProperty: ignoreUnsupportedAction,
        addDraggedPageRow: ignoreUnsupportedAction,
        addFormView: ignoreUnsupportedAction,
        addGalleryView: ignoreUnsupportedAction,
        addKanbanView: ignoreUnsupportedAction,
        addListView: ignoreUnsupportedAction,
        addTableView: ignoreUnsupportedAction,
        addTimelineRow: ignoreUnsupportedAction,
        addTimelineView: ignoreUnsupportedAction,
        deleteDatabaseView: ignoreUnsupportedAction,
        duplicateDatabaseView: ignoreUnsupportedAction,
        getDatabasePageDragPayload: () => null,
        hasDatabasePageDragPayload: () => false,
        linkDataSourceView: ignoreUnsupportedAction,
        renameDatabaseProperty: ignoreUnsupportedAction,
        saveDatabaseEmoji: ignoreUnsupportedAction,
        saveDatabaseTitle: ignoreUnsupportedAction,
        saveDatabaseViewIcon: ignoreUnsupportedAction,
        saveDatabaseViewTitle: ignoreUnsupportedAction,
        setDraftDatabaseTitle: ignoreUnsupportedAction,
        setDraftViewTitle: ignoreUnsupportedAction,
        setViewDateProperty: ignoreUnsupportedAction,
        setViewType: ignoreUnsupportedAction,
        setupTimelineDateProperty: ignoreUnsupportedAction,
      }}
    >
      {children}
    </DatabaseViewProvider>
  )
}
