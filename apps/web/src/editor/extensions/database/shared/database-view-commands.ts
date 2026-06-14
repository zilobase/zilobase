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
import {
  canUpdateKanbanGroupProperty,
  type DatabasePropertyListItem,
} from "../kanban/database-kanban-config"
import { serializePropertyValue, type DatabasePropertyValue } from "../utils"
import {
  areSerializedPropertyValuesEqual,
  hasViewHiddenPropertyIds,
} from "./database-item-utils"
import type { DatabasePageDragPayload } from "./database-page-drop"
import {
  getDatabaseFilterOperatorsForType,
  getMergedDatabaseConfig,
  getPropertyHidden,
  getViewHiddenPropertyIds,
  getValidDatabaseFilterOperator,
  type DatabaseConditionalColorConfig,
  type DatabasePropertyFilterConfig,
  type DatabaseSortConfig,
} from "./database-view-config"
import type { DatabaseFilterUpdatePatch } from "./database-filter-menu"

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
  activeDatabaseFilters,
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
  setFilterPickerOpen,
  setShowFilterPill,
  setShowSortPill,
  setSortPickerOpen,
}: {
  activeDatabaseFilters: DatabasePropertyFilterConfig[]
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
  setFilterPickerOpen: Dispatch<SetStateAction<boolean>>
  setShowFilterPill: Dispatch<SetStateAction<boolean>>
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
      return Promise.resolve()
    }

    return updateDatabaseView.mutateAsync({
      config: getMergedDatabaseConfig(activeView.config, {
        sort: undefined,
        sorts: nextSorts.length > 0 ? nextSorts : undefined,
      }),
      databaseId,
      databaseViewId: activeView.id,
    })
  }

  const saveDatabaseFilters = (nextFilters: DatabasePropertyFilterConfig[]) => {
    if (!databaseId || !activeView?.id) {
      return
    }

    updateDatabaseView.mutate({
      config: getMergedDatabaseConfig(activeView.config, {
        filter: undefined,
        filters: nextFilters.length > 0 ? nextFilters : undefined,
      }),
      databaseId,
      databaseViewId: activeView.id,
    })
  }

  const saveDatabaseConditionalColors = (
    nextConditionalColors: DatabaseConditionalColorConfig[]
  ) => {
    if (!databaseId || !activeView?.id) {
      return
    }

    updateDatabaseView.mutate({
      config: getMergedDatabaseConfig(activeView.config, {
        conditionalColors:
          nextConditionalColors.length > 0 ? nextConditionalColors : undefined,
      }),
      databaseId,
      databaseViewId: activeView.id,
    })
  }

  const getFilterPropertyType = (
    propertyId: DatabasePropertyFilterConfig["propertyId"]
  ) => {
    if (propertyId === "name") {
      return "text"
    }

    return (
      properties.find((property) => property.id === propertyId)?.property.type ??
      "text"
    )
  }

  const createDatabaseFilter = (
    propertyId: DatabasePropertyFilterConfig["propertyId"]
  ): DatabasePropertyFilterConfig => {
    const propertyType = getFilterPropertyType(propertyId)

    return {
      id: createDatabaseFilterId(),
      operator: getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is",
      propertyId,
      values: [],
    }
  }

  const getPlainDatabaseFilters = () =>
    activeDatabaseFilters.map(({ id, operator, propertyId, values }) => ({
      id,
      operator: getValidDatabaseFilterOperator(
        operator,
        getFilterPropertyType(propertyId)
      ),
      propertyId,
      values,
    }))

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
        config: getDefaultDatabasePropertyConfig(type),
        databaseId,
        name: label,
        position,
        type,
      })
    },
    addDatabaseRow: (
      groupValue?: string,
      groupPropertyOverride?: DatabasePropertyListItem | null
    ) => {
      if (!editable || !databaseId || addRow.isPending) {
        return
      }

      const existingItemIds = new Set(items.map((row) => row.id))
      const defaultStatusValue = defaultStatusOptions[0]?.name ?? "Not started"
      const nextGroupProperty =
        groupPropertyOverride ??
        (isKanbanView ? kanbanGroupProperty : null)
      const nextGroupValue =
        groupValue ??
        (isKanbanView && kanbanGroupProperty?.property.type === "status"
          ? defaultStatusValue
          : null)

      addRow.mutate(
        {
          databaseId,
          title:
            nextGroupProperty?.id === "name" && nextGroupValue
              ? nextGroupValue
              : "Untitled",
        },
        {
          onSuccess: (nextPayload) => {
            if (
              !nextGroupValue ||
              !nextGroupProperty ||
              !canUpdateKanbanGroupProperty(nextGroupProperty)
            ) {
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
              propertyId: nextGroupProperty.property.id,
              rowId: addedItem.id,
              value: serializePropertyValue(
                nextGroupProperty.property.type,
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
      if (!databaseId || addDatabaseView.isPending) {
        return
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id)
      )
      const currentProperties = payload?.properties ?? []
      const groupProperty =
        currentProperties.find((property) => property.property.type === "status") ??
        currentProperties.find((property) => property.property.type === "select") ??
        currentProperties.find(
          (property) => property.property.type === "multi_select"
        ) ??
        currentProperties[0] ??
        null
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

      addView("name", [])
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
    clearDatabaseFilter: () => {
      saveDatabaseFilters([])
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
    setViewGroupProperty: (groupPropertyId: string | null) => {
      if (!databaseId || !activeView?.id) {
        return
      }

      updateDatabaseView.mutate({
        config: getMergedDatabaseConfig(activeView.config, {
          groupPropertyId: groupPropertyId ?? undefined,
        }),
        databaseId,
        databaseViewId: activeView.id,
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
    createDatabaseFilter: (field: string) => {
      if (
        activeDatabaseFilters.some((filter) => filter.propertyId === field)
      ) {
        setShowFilterPill(true)
        setFilterPickerOpen(false)
        return
      }

      saveDatabaseFilters([
        ...getPlainDatabaseFilters(),
        createDatabaseFilter(field),
      ])
      setShowFilterPill(true)
      setFilterPickerOpen(false)
    },
    removeDatabaseFilter: (index: number) => {
      saveDatabaseFilters(
        getPlainDatabaseFilters().filter((_, filterIndex) => filterIndex !== index)
      )
    },
    reorderDatabaseFilters: (filterIds: string[]) => {
      const filters = getPlainDatabaseFilters()
      const filtersById = new Map(
        filters.map((filter) => [filter.id, filter])
      )
      const reorderedFilters = filterIds.flatMap((filterId) => {
        const filter = filtersById.get(filterId)

        return filter ? [filter] : []
      })
      const remainingFilters = filters.filter(
        (filter) => !filterIds.includes(filter.id)
      )

      saveDatabaseFilters([...reorderedFilters, ...remainingFilters])
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
    saveDatabaseFilters,
    saveDatabaseConditionalColors,
    saveDatabaseSorts,
    saveDatabaseEmoji: (nextEmoji: string) => {
      if (!editable || !databaseId) {
        return
      }

      updateDatabase.mutate({
        config: getMergedDatabaseConfig(payload?.database.config, {
          emoji: nextEmoji,
        }),
        databaseId,
      })
    },
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
    setViewType: (type: "table" | "kanban") => {
      if (!databaseId || !activeView?.id || type === activeView.type) {
        return
      }

      updateDatabaseView.mutate({
        config:
          type === "kanban"
            ? getMergedDatabaseConfig(activeView.config, {
                groupPropertyId:
                  kanbanGroupProperty?.property.id ??
                  (properties.length === 0 ? "name" : undefined),
              })
            : activeView.config,
        databaseId,
        databaseViewId: activeView.id,
        type,
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
    toggleFilterPillVisibility: () => {
      setShowFilterPill((visible) => !visible)
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
    updateDatabaseFilter: (index: number, patch: DatabaseFilterUpdatePatch) => {
      saveDatabaseFilters(
        getPlainDatabaseFilters().map((filter, filterIndex) => {
          if (filterIndex !== index) {
            return filter
          }

          if (patch.propertyId && patch.propertyId !== filter.propertyId) {
            const propertyType = getFilterPropertyType(patch.propertyId)
            const operator =
              getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is"

            return {
              ...filter,
              operator,
              propertyId: patch.propertyId,
              values: patch.values ?? [],
            }
          }

          const propertyType = getFilterPropertyType(filter.propertyId)
          const operator = patch.operator
            ? getValidDatabaseFilterOperator(patch.operator, propertyType)
            : filter.operator

          return {
            ...filter,
            operator,
            values: patch.values ?? filter.values,
          }
        })
      )
    },
  }
}

function getDefaultDatabasePropertyConfig(type: string) {
  if (type === "status") {
    return {
      defaultOptionId: defaultStatusOptions[0]?.id,
      options: defaultStatusOptions,
    }
  }

  if (type === "formula") {
    return { formula: "" }
  }

  return undefined
}

function createDatabaseFilterId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `filter-${crypto.randomUUID()}`
  }

  return `filter-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`
}
