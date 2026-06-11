import type { Dispatch, SetStateAction } from "react"
import { toast } from "sonner"

import type {
  DatabasePayload,
  DatabaseProperty,
  DatabaseRow,
  DatabaseView,
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useAddDatabaseView,
  useUpdateDatabase,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
  useUpdateDatabaseView,
} from "@notelab/features/databases"

import { defaultStatusOptions } from "../constants"
import type { DatabasePropertyListItem } from "../kanban/database-kanban-config"
import { serializePropertyValue, type DatabasePropertyValue } from "../utils"
import {
  areSerializedPropertyValuesEqual,
  hasViewHiddenPropertyIds,
} from "./database-item-utils"
import type { DatabasePageDragPayload } from "./database-page-drop"
import {
  getMergedDatabaseConfig,
  getPropertyHidden,
  getViewHiddenPropertyIds,
  type DatabaseSortConfig,
} from "./database-view-config"

type DatabaseMutations = {
  addDatabaseView: ReturnType<typeof useAddDatabaseView>
  addProperty: ReturnType<typeof useAddDatabaseProperty>
  addRow: ReturnType<typeof useAddDatabaseRow>
  updateDatabase: ReturnType<typeof useUpdateDatabase>
  updateDatabaseView: ReturnType<typeof useUpdateDatabaseView>
  updateProperty: ReturnType<typeof useUpdateDatabaseProperty>
  updateValue: ReturnType<typeof useUpdateDatabasePropertyValue>
}

export type DatabaseViewCommands = ReturnType<typeof getDatabaseViewCommands>

export function getDatabaseViewCommands({
  activeDatabaseSorts,
  activeView,
  databaseId,
  editable,
  isKanbanView,
  items,
  kanbanGroupProperty,
  mutations,
  payload,
  properties,
  setActiveViewId,
  setShowSortPill,
  setSortPickerOpen,
}: {
  activeDatabaseSorts: DatabaseSortConfig[]
  activeView: DatabaseView | null
  databaseId: string | null | undefined
  editable: boolean
  isKanbanView: boolean
  items: DatabaseRow[]
  kanbanGroupProperty: DatabasePropertyListItem | null
  mutations: DatabaseMutations
  payload: DatabasePayload | null | undefined
  properties: DatabaseProperty[]
  setActiveViewId: Dispatch<SetStateAction<string | null>>
  setShowSortPill: Dispatch<SetStateAction<boolean>>
  setSortPickerOpen: Dispatch<SetStateAction<boolean>>
}) {
  const {
    addDatabaseView,
    addProperty,
    addRow,
    updateDatabase,
    updateDatabaseView,
    updateProperty,
    updateValue,
  } = mutations

  const saveDatabaseSorts = (nextSorts: DatabaseSortConfig[]) => {
    if (!databaseId || !activeView?.id) {
      return
    }

    updateDatabaseView.mutate({
      config: getMergedDatabaseConfig(activeView.config, {
        sort: undefined,
        sorts: nextSorts.length > 0 ? nextSorts : undefined,
      }),
      databaseId,
      databaseViewId: activeView.id,
    })
  }

  return {
    addDatabaseProperty: (
      type = "text",
      label = "Property",
      position?: number
    ) => {
      if (!editable || !databaseId || addProperty.isPending) {
        return
      }

      addProperty.mutate({
        config:
          type === "status"
            ? {
                defaultOptionId: defaultStatusOptions[0]?.id,
                options: defaultStatusOptions,
              }
            : undefined,
        databaseId,
        name: label,
        position,
        type,
      })
    },
    addDatabaseRow: (groupValue?: string) => {
      if (!editable || !databaseId || addRow.isPending) {
        return
      }

      const existingItemIds = new Set(items.map((row) => row.id))
      const defaultStatusValue = defaultStatusOptions[0]?.name ?? "Not started"
      const nextGroupValue =
        groupValue ??
        (isKanbanView && kanbanGroupProperty?.property.type === "status"
          ? defaultStatusValue
          : null)

      addRow.mutate(
        {
          databaseId,
          title: "Untitled",
        },
        {
          onSuccess: (nextPayload) => {
            if (!nextGroupValue || !kanbanGroupProperty) {
              return
            }

            const addedItem =
              nextPayload.rows.find((row) => !existingItemIds.has(row.id)) ??
              nextPayload.rows.at(-1)

            if (!addedItem) {
              return
            }

            updateValue.mutate({
              databaseId,
              propertyId: kanbanGroupProperty.property.id,
              rowId: addedItem.id,
              value: serializePropertyValue(
                kanbanGroupProperty.property.type,
                nextGroupValue
              ),
            })
          },
        }
      )
    },
    addDraggedPageRow: (
      dragPayload: DatabasePageDragPayload,
      position: number
    ) => {
      if (!databaseId || addRow.isPending) {
        return
      }

      if (dragPayload.pageId === payload?.database.pageId) {
        toast.error("You can't nest a page inside itself.")
        return
      }

      if (items.some((row) => row.pageId === dragPayload.pageId)) {
        toast.error("This page is already in this database.")
        return
      }

      addRow.mutate({
        databaseId,
        pageId: dragPayload.pageId,
        position,
        title: dragPayload.title,
      })
    },
    addKanbanView: () => {
      if (!databaseId || addDatabaseView.isPending || addProperty.isPending) {
        return
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id)
      )
      const currentProperties = payload?.properties ?? []
      const groupProperty =
        currentProperties.find((property) => property.property.type === "status") ??
        currentProperties.find((property) => property.property.type === "select")
      const addView = (
        groupPropertyId: string,
        hiddenPropertyIds: string[],
        onViewAdded?: (nextPayload: { rows: { id: string }[] }) => void
      ) => {
        addDatabaseView.mutate(
          {
            config: { groupPropertyId, hiddenPropertyIds },
            databaseId,
            name: "Kanban",
            type: "kanban",
          },
          {
            onSuccess: (nextPayload) => {
              const addedView =
                nextPayload.views.find((view) => !existingViewIds.has(view.id)) ??
                nextPayload.views.at(-1)

              setActiveViewId(addedView?.id ?? null)
              onViewAdded?.(nextPayload)
            },
            onError: () => {
              toast.error("Couldn't add kanban view")
            },
          }
        )
      }

      if (groupProperty) {
        addView(
          groupProperty.property.id,
          currentProperties.map((property) => property.id)
        )
        return
      }

      const existingPropertyIds = new Set(
        currentProperties.map((property) => property.property.id)
      )

      addProperty.mutate(
        {
          config: {
            defaultOptionId: defaultStatusOptions[0]?.id,
            options: defaultStatusOptions,
          },
          databaseId,
          name: "Status",
          type: "status",
        },
        {
          onSuccess: (nextPayload) => {
            const addedProperty =
              nextPayload.properties.find(
                (property) =>
                  !existingPropertyIds.has(property.property.id) &&
                  property.property.type === "status"
              ) ??
              nextPayload.properties.find(
                (property) => property.property.type === "status"
              )

            if (!addedProperty) {
              toast.error("Couldn't create status property")
              return
            }

            addView(
              addedProperty.property.id,
              nextPayload.properties.map((property) => property.id),
              (viewPayload) => {
                for (const row of viewPayload.rows) {
                  updateValue.mutate({
                    databaseId,
                    propertyId: addedProperty.property.id,
                    rowId: row.id,
                    value: defaultStatusOptions[0]?.name ?? "Not started",
                  })
                }
              }
            )
          },
          onError: () => {
            toast.error("Couldn't create status property")
          },
        }
      )
    },
    addTableView: () => {
      if (!databaseId || addDatabaseView.isPending) {
        return
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id)
      )

      addDatabaseView.mutate(
        {
          databaseId,
          name: "Table",
          type: "table",
        },
        {
          onSuccess: (nextPayload) => {
            const addedView =
              nextPayload.views.find((view) => !existingViewIds.has(view.id)) ??
              nextPayload.views.at(-1)

            setActiveViewId(addedView?.id ?? null)
          },
          onError: () => {
            toast.error("Couldn't add table view")
          },
        }
      )
    },
    clearDatabaseSort: () => {
      saveDatabaseSorts([])
    },
    copyDatabaseViewLink: () => {
      if (!databaseId || typeof window === "undefined") {
        return
      }

      void navigator.clipboard
        .writeText(`${window.location.origin}/database/${databaseId}`)
        .then(() => {
          toast.success("Copied link to view")
        })
        .catch(() => {
          toast.error("Couldn't copy link to view")
        })
    },
    createDatabaseSort: (field: string) => {
      saveDatabaseSorts([
        ...activeDatabaseSorts.map(({ column, direction }) => ({
          column,
          direction,
        })),
        {
          column: field,
          direction: "ascending",
        },
      ])
      setShowSortPill(true)
      setSortPickerOpen(false)
    },
    removeDatabaseSort: (index: number) => {
      saveDatabaseSorts(
        activeDatabaseSorts.flatMap(({ column, direction }, sortIndex) =>
          sortIndex === index ? [] : [{ column, direction }]
        )
      )
    },
    renameDatabaseProperty: (databasePropertyId: string, name: string) => {
      if (!databaseId) {
        return
      }

      updateProperty.mutate({
        databaseId,
        databasePropertyId,
        name,
      })
    },
    saveDatabaseSorts,
    saveDatabaseTitle: (nextTitle: string) => {
      if (!databaseId || nextTitle === payload?.database.name) {
        return
      }

      updateDatabase.mutate({
        databaseId,
        name: nextTitle,
      })
    },
    saveDatabaseViewTitle: (nextTitle: string) => {
      if (!databaseId || !activeView?.id || nextTitle === activeView.name) {
        return
      }

      updateDatabaseView.mutate({
        databaseId,
        databaseViewId: activeView.id,
        name: nextTitle,
      })
    },
    savePropertyValue: (
      rowId: string,
      propertyId: string,
      propertyType: string,
      currentValue: DatabasePropertyValue,
      nextValue: DatabasePropertyValue
    ) => {
      if (!editable || !databaseId) {
        return
      }

      if (
        areSerializedPropertyValuesEqual(propertyType, currentValue, nextValue)
      ) {
        return
      }

      updateValue.mutate({
        databaseId,
        propertyId,
        rowId,
        value: serializePropertyValue(propertyType, nextValue),
      })
    },
    togglePropertyVisibility: (propertyId: string) => {
      if (!databaseId || !activeView?.id) {
        return
      }

      const hiddenPropertyIds = new Set(
        hasViewHiddenPropertyIds(activeView.config)
          ? getViewHiddenPropertyIds(activeView.config)
          : isKanbanView
            ? properties.map((property) => property.id)
            : properties
                .filter((property) => getPropertyHidden(property.property.config))
                .map((property) => property.id)
      )

      if (hiddenPropertyIds.has(propertyId)) {
        hiddenPropertyIds.delete(propertyId)
      } else {
        hiddenPropertyIds.add(propertyId)
      }

      updateDatabaseView.mutate({
        config: getMergedDatabaseConfig(activeView.config, {
          hiddenPropertyIds: [...hiddenPropertyIds],
        }),
        databaseId,
        databaseViewId: activeView.id,
      })
    },
    toggleSortPillVisibility: () => {
      setShowSortPill((visible) => !visible)
    },
    updateDatabasePropertyConfig: (
      databasePropertyId: string,
      config: unknown
    ) => {
      if (!databaseId) {
        return Promise.resolve()
      }

      return updateProperty.mutateAsync({
        config,
        databaseId,
        databasePropertyId,
      })
    },
    updateDatabaseSort: (index: number, patch: Partial<DatabaseSortConfig>) => {
      saveDatabaseSorts(
        activeDatabaseSorts.map(({ column, direction }, sortIndex) =>
          sortIndex === index
            ? { column, direction, ...patch }
            : { column, direction }
        )
      )
    },
  }
}
