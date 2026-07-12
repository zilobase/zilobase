import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";

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
} from "@notelab/features/databases";

import { defaultStatusOption } from "../core/database-property-types";
import {
  canUpdateKanbanGroupProperty,
  getKanbanGroupPropertyId,
  type DatabasePropertyListItem,
} from "./kanban/database-kanban-config";
import {
  ganttMoveToDateValue,
  getTimelineDateProperty,
} from "./timeline/database-timeline-config";
import {
  getDefaultDatabasePropertyConfig,
  isSelectLikePropertyType,
} from "../core/database-property-types";
import {
  serializePropertyValue,
  type DatabasePropertyValue,
} from "../core/utils";
import {
  areSerializedPropertyValuesEqual,
  hasViewHiddenPropertyIds,
} from "../interactions/database-item-utils";
import type { DatabasePageDragPayload } from "../interactions/database-page-drop";
import {
  getDatabaseFilterOperatorsForType,
  getMergedDatabaseConfig,
  getMergedPropertyConfig,
  getPropertyHidden,
  getShowPropertyTitles,
  getViewHiddenPropertyIds,
  getValidDatabaseFilterOperator,
  type DatabaseConditionalColorConfig,
  type DatabasePropertyFilterConfig,
  type DatabasePropertyConfig,
  type DatabaseSortConfig,
} from "./database-view-config";
import type { DatabaseFilterUpdatePatch } from "./database-filter-menu";
import { getRelationLimitTrimUpdates } from "../properties/database-relation-sync";

type DatabaseMutations = {
  addDatabaseView: ReturnType<typeof useAddDatabaseView>;
  addProperty: ReturnType<typeof useAddDatabaseProperty>;
  addRow: ReturnType<typeof useAddDatabaseRow>;
  updateDatabase: ReturnType<typeof useUpdateDatabase>;
  updateDatabaseView: ReturnType<typeof useUpdateDatabaseView>;
  updateProperty: ReturnType<typeof useUpdateDatabaseProperty>;
  updateValue: ReturnType<typeof useUpdateDatabasePropertyValue>;
};

export type DatabaseViewCommands = ReturnType<typeof getDatabaseViewCommands>;

export function getDatabaseViewCommands({
  activeDatabaseFilters,
  activeDatabaseSorts,
  activeView,
  databaseId,
  editable,
  isKanbanView,
  items,
  kanbanGroupProperty,
  timelineDateProperty = null,
  mutations,
  payload,
  properties,
  setActiveViewId,
  setFilterPickerOpen,
  setShowFilterPill,
  setShowSortPill,
  setSortPickerOpen,
  getLatestViewConfig,
  getSourcePropertyMode,
  setLatestViewConfig,
}: {
  activeDatabaseFilters: DatabasePropertyFilterConfig[];
  activeDatabaseSorts: DatabaseSortConfig[];
  activeView: DatabaseView | null;
  databaseId: string | null | undefined;
  editable: boolean;
  isKanbanView: boolean;
  items: DatabaseRow[];
  kanbanGroupProperty: DatabasePropertyListItem | null;
  timelineDateProperty: DatabasePropertyListItem | null;
  mutations: DatabaseMutations;
  payload: DatabasePayload | null | undefined;
  properties: DatabaseProperty[];
  setActiveViewId: Dispatch<SetStateAction<string | null>>;
  setFilterPickerOpen: Dispatch<SetStateAction<boolean>>;
  setShowFilterPill: Dispatch<SetStateAction<boolean>>;
  setShowSortPill: Dispatch<SetStateAction<boolean>>;
  setSortPickerOpen: Dispatch<SetStateAction<boolean>>;
  getLatestViewConfig?: (
    databaseId: string,
    databaseViewId: string,
    fallbackConfig: unknown,
  ) => unknown;
  getSourcePropertyMode?: (
    dragPayload: DatabasePageDragPayload,
  ) => Promise<"duplicate" | "match" | null>;
  setLatestViewConfig?: (
    databaseId: string,
    databaseViewId: string,
    config: unknown,
  ) => void;
}) {
  const {
    addDatabaseView,
    addProperty,
    addRow,
    updateDatabase,
    updateDatabaseView,
    updateProperty,
    updateValue,
  } = mutations;
  const { ensureTimelineDatePropertyId } = getDatabaseViewCommandsContext({
    addProperty,
    databaseId,
    editable,
    payload,
    properties,
    timelineDateProperty,
  });

  const saveDatabaseSorts = (nextSorts: DatabaseSortConfig[]) => {
    if (!databaseId || !activeView?.id) {
      return Promise.resolve();
    }

    setShowSortPill(nextSorts.length > 0);

    return updateDatabaseView.mutateAsync({
      config: getMergedDatabaseConfig(activeView.config, {
        sorts: nextSorts.length > 0 ? nextSorts : undefined,
      }),
      databaseId,
      databaseViewId: activeView.id,
    });
  };

  const saveDatabaseFilters = (nextFilters: DatabasePropertyFilterConfig[]) => {
    if (!databaseId || !activeView?.id) {
      return;
    }

    updateDatabaseView.mutate({
      config: getMergedDatabaseConfig(activeView.config, {
        filters: nextFilters.length > 0 ? nextFilters : undefined,
      }),
      databaseId,
      databaseViewId: activeView.id,
    });
  };

  const saveDatabaseConditionalColors = (
    nextConditionalColors: DatabaseConditionalColorConfig[],
  ) => {
    if (!databaseId || !activeView?.id) {
      return;
    }

    updateDatabaseView.mutate({
      config: getMergedDatabaseConfig(activeView.config, {
        conditionalColors:
          nextConditionalColors.length > 0 ? nextConditionalColors : undefined,
      }),
      databaseId,
      databaseViewId: activeView.id,
    });
  };

  const getFilterPropertyType = (
    propertyId: DatabasePropertyFilterConfig["propertyId"],
  ) => {
    if (propertyId === "name") {
      return "text";
    }

    return (
      properties.find((property) => property.id === propertyId)?.property
        .type ?? "text"
    );
  };

  const createDatabaseFilter = (
    propertyId: DatabasePropertyFilterConfig["propertyId"],
  ): DatabasePropertyFilterConfig => {
    const propertyType = getFilterPropertyType(propertyId);

    return {
      id: createDatabaseFilterId(),
      operator:
        getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is",
      propertyId,
      values: [],
    };
  };

  const getPlainDatabaseFilters = () =>
    activeDatabaseFilters.map(({ id, operator, propertyId, values }) => ({
      id,
      operator: getValidDatabaseFilterOperator(
        operator,
        getFilterPropertyType(propertyId),
      ),
      propertyId,
      values,
    }));

  return {
    addDatabaseProperty: (
      type = "text",
      label = "Property",
      position?: number,
    ) => {
      if (!editable || !databaseId || addProperty.isPending) {
        return;
      }

      addProperty.mutate({
        config: getDefaultDatabasePropertyConfig(type),
        databaseId,
        name: label,
        position,
        type,
      });
    },
    addDatabaseRow: (
      groupValue?: string,
      groupPropertyOverride?: DatabasePropertyListItem | null,
    ) => {
      if (!editable || !databaseId || addRow.isPending) {
        return;
      }

      const existingItemIds = new Set(items.map((row) => row.id));
      const defaultStatusValue = defaultStatusOption.name;
      const nextGroupProperty =
        groupPropertyOverride ?? (isKanbanView ? kanbanGroupProperty : null);
      const nextGroupValue =
        groupValue ??
        (isKanbanView && kanbanGroupProperty?.property.type === "status"
          ? defaultStatusValue
          : null);

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
              return;
            }

            const addedItem =
              nextPayload.rows.find((row) => !existingItemIds.has(row.id)) ??
              nextPayload.rows.at(-1);

            if (!addedItem) {
              return;
            }

            updateValue.mutate({
              databaseId,
              propertyId: nextGroupProperty.property.id,
              rowId: addedItem.id,
              value: serializePropertyValue(
                nextGroupProperty.property.type,
                nextGroupValue,
              ),
            });
          },
        },
      );
    },
    addDraggedPageRow: async (
      dragPayload: DatabasePageDragPayload,
      position: number,
    ) => {
      if (!databaseId || addRow.isPending) {
        return;
      }

      if (dragPayload.pageId === payload?.database.pageId) {
        toast.error("You can't nest a page inside itself.");
        return;
      }

      if (items.some((row) => row.pageId === dragPayload.pageId)) {
        toast.error("This page is already in this database.");
        return;
      }

      const sourcePropertyMode =
        dragPayload.databaseId && dragPayload.databaseId !== databaseId
          ? await getSourcePropertyMode?.(dragPayload)
          : undefined;

      if (sourcePropertyMode === null) {
        return;
      }

      addRow.mutate({
        databaseId,
        pageId: dragPayload.pageId,
        position,
        sourceDatabaseId:
          dragPayload.databaseId && dragPayload.databaseId !== databaseId
            ? dragPayload.databaseId
            : undefined,
        sourcePropertyMode: sourcePropertyMode ?? undefined,
        title: dragPayload.title,
      });
    },
    addKanbanView: () => {
      if (!databaseId || addDatabaseView.isPending) {
        return;
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id),
      );
      const currentProperties = payload?.properties ?? [];
      const groupProperty =
        currentProperties.find(
          (property) => property.property.type === "status",
        ) ??
        currentProperties.find(
          (property) =>
            property.property.type !== "status" &&
            isSelectLikePropertyType(property.property.type),
        ) ??
        currentProperties[0] ??
        null;
      const addView = (
        groupPropertyId: string,
        hiddenPropertyIds: string[],
        onViewAdded?: (nextPayload: { rows: { id: string }[] }) => void,
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
                nextPayload.views.find(
                  (view) => !existingViewIds.has(view.id),
                ) ?? nextPayload.views.at(-1);

              setActiveViewId(addedView?.id ?? null);
              onViewAdded?.(nextPayload);
            },
            onError: () => {
              toast.error("Couldn't add kanban view");
            },
          },
        );
      };

      if (groupProperty) {
        addView(
          groupProperty.property.id,
          currentProperties.map((property) => property.id),
        );
        return;
      }

      addView("name", []);
    },
    addTimelineRow: (startAt: Date) => {
      if (
        !editable ||
        !databaseId ||
        !timelineDateProperty ||
        addRow.isPending
      ) {
        return;
      }

      const existingItemIds = new Set(items.map((row) => row.id));

      addRow.mutate(
        {
          databaseId,
          title: "Untitled",
        },
        {
          onSuccess: (nextPayload) => {
            const addedItem =
              nextPayload.rows.find((row) => !existingItemIds.has(row.id)) ??
              nextPayload.rows.at(-1);

            if (!addedItem) {
              return;
            }

            updateValue.mutate({
              databaseId,
              propertyId: timelineDateProperty.property.id,
              rowId: addedItem.id,
              value: ganttMoveToDateValue(startAt, null),
            });
          },
        },
      );
    },
    addTimelineView: () => {
      if (!databaseId || addDatabaseView.isPending || addProperty.isPending) {
        return;
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id),
      );

      ensureTimelineDatePropertyId((datePropertyId) => {
        const currentProperties = payload?.properties ?? properties;
        const groupPropertyId = getTimelineGroupPropertyId(currentProperties);

        addDatabaseView.mutate(
          {
            config: {
              datePropertyId,
              ...(groupPropertyId ? { groupPropertyId } : {}),
            },
            databaseId,
            name: "Timeline",
            type: "timeline",
          },
          {
            onSuccess: (nextPayload) => {
              const addedView =
                nextPayload.views.find(
                  (view) => !existingViewIds.has(view.id),
                ) ?? nextPayload.views.at(-1);

              setActiveViewId(addedView?.id ?? null);
            },
            onError: () => {
              toast.error("Couldn't add timeline view");
            },
          },
        );
      });
    },
    addTableView: () => {
      if (!databaseId || addDatabaseView.isPending) {
        return;
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id),
      );

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
              nextPayload.views.at(-1);

            setActiveViewId(addedView?.id ?? null);
          },
          onError: () => {
            toast.error("Couldn't add table view");
          },
        },
      );
    },
    clearDatabaseSort: () => {
      saveDatabaseSorts([]);
    },
    clearDatabaseFilter: () => {
      saveDatabaseFilters([]);
    },
    copyDatabaseViewLink: () => {
      if (!databaseId || typeof window === "undefined") {
        return;
      }

      void navigator.clipboard
        .writeText(`${window.location.origin}/d/${databaseId}`)
        .then(() => {
          toast.success("Copied link to view");
        })
        .catch(() => {
          toast.error("Couldn't copy link to view");
        });
    },
    setViewGroupProperty: (groupPropertyId: string | null) => {
      if (!databaseId || !activeView?.id) {
        return;
      }

      updateDatabaseView.mutate({
        config: getMergedDatabaseConfig(activeView.config, {
          groupPropertyId: groupPropertyId ?? undefined,
        }),
        databaseId,
        databaseViewId: activeView.id,
      });
    },
    setViewDateProperty: (datePropertyId: string | null) => {
      if (!databaseId || !activeView?.id) {
        return;
      }

      updateDatabaseView.mutate({
        config: getMergedDatabaseConfig(activeView.config, {
          datePropertyId: datePropertyId ?? undefined,
        }),
        databaseId,
        databaseViewId: activeView.id,
      });
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
      ]);
      setSortPickerOpen(false);
    },
    createDatabaseFilter: (field: string) => {
      if (activeDatabaseFilters.some((filter) => filter.propertyId === field)) {
        setShowFilterPill(true);
        setFilterPickerOpen(false);
        return;
      }

      saveDatabaseFilters([
        ...getPlainDatabaseFilters(),
        createDatabaseFilter(field),
      ]);
      setShowFilterPill(true);
      setFilterPickerOpen(false);
    },
    removeDatabaseFilter: (index: number) => {
      saveDatabaseFilters(
        getPlainDatabaseFilters().filter(
          (_, filterIndex) => filterIndex !== index,
        ),
      );
    },
    reorderDatabaseFilters: (filterIds: string[]) => {
      const filters = getPlainDatabaseFilters();
      const filtersById = new Map(filters.map((filter) => [filter.id, filter]));
      const reorderedFilters = filterIds.flatMap((filterId) => {
        const filter = filtersById.get(filterId);

        return filter ? [filter] : [];
      });
      const remainingFilters = filters.filter(
        (filter) => !filterIds.includes(filter.id),
      );

      saveDatabaseFilters([...reorderedFilters, ...remainingFilters]);
    },
    removeDatabaseSort: (index: number) => {
      saveDatabaseSorts(
        activeDatabaseSorts.flatMap(({ column, direction }, sortIndex) =>
          sortIndex === index ? [] : [{ column, direction }],
        ),
      );
    },
    renameDatabaseProperty: (databasePropertyId: string, name: string) => {
      if (!databaseId) {
        return;
      }

      updateProperty.mutate({
        databaseId,
        databasePropertyId,
        name,
      });
    },
    saveDatabaseFilters,
    saveDatabaseConditionalColors,
    saveDatabasePropertyOrder: (propertyIds: string[]) => {
      if (!editable || !databaseId || !activeView?.id) {
        return;
      }

      const validPropertyIds = new Set([
        "name",
        ...properties.map((property) => property.id),
      ]);
      const seenPropertyIds = new Set<string>();
      const orderedPropertyIds = propertyIds.filter((propertyId) => {
        if (
          !validPropertyIds.has(propertyId) ||
          seenPropertyIds.has(propertyId)
        ) {
          return false;
        }

        seenPropertyIds.add(propertyId);
        return true;
      });
      const propertyOrder = [
        ...orderedPropertyIds,
        ...properties
          .map((property) => property.id)
          .filter((propertyId) => !seenPropertyIds.has(propertyId)),
      ];
      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ??
        activeView.config;
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        propertyOrder,
      });

      setLatestViewConfig?.(databaseId, activeView.id, nextConfig);
      updateDatabaseView.mutate({
        config: nextConfig,
        databaseId,
        databaseViewId: activeView.id,
      });
    },
    saveDatabaseSorts,
    saveDatabaseEmoji: (nextEmoji: string) => {
      if (!editable || !databaseId) {
        return;
      }

      updateDatabase.mutate({
        config: getMergedDatabaseConfig(payload?.database.config, {
          emoji: nextEmoji,
        }),
        databaseId,
      });
    },
    saveDatabaseTitle: (nextTitle: string) => {
      if (!databaseId || nextTitle === payload?.database.name) {
        return;
      }

      updateDatabase.mutate({
        databaseId,
        name: nextTitle,
      });
    },
    saveDatabaseViewTitle: (nextTitle: string) => {
      if (!databaseId || !activeView?.id || nextTitle === activeView.name) {
        return;
      }

      updateDatabaseView.mutate({
        databaseId,
        databaseViewId: activeView.id,
        name: nextTitle,
      });
    },
    setViewType: (type: "table" | "kanban" | "timeline") => {
      if (!databaseId || !activeView?.id || type === activeView.type) {
        return;
      }

      if (type === "timeline") {
        ensureTimelineDatePropertyId((datePropertyId) => {
          const groupPropertyId =
            getKanbanGroupPropertyId(activeView.config) ??
            getTimelineGroupPropertyId(properties) ??
            undefined;

          updateDatabaseView.mutate({
            config: getMergedDatabaseConfig(activeView.config, {
              datePropertyId,
              ...(groupPropertyId ? { groupPropertyId } : {}),
            }),
            databaseId,
            databaseViewId: activeView.id,
            type,
          });
        });
        return;
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
      });
    },
    savePropertyValue: (
      rowId: string,
      propertyId: string,
      propertyType: string,
      currentValue: DatabasePropertyValue,
      nextValue: DatabasePropertyValue,
    ) => {
      if (!editable || !databaseId) {
        return;
      }

      if (
        areSerializedPropertyValuesEqual(propertyType, currentValue, nextValue)
      ) {
        return;
      }

      updateValue.mutate({
        databaseId,
        propertyId,
        rowId,
        value: serializePropertyValue(propertyType, nextValue),
      });
    },
    togglePropertyVisibility: (propertyId: string) => {
      if (!databaseId || !activeView?.id) {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ??
        activeView.config;
      const hiddenPropertyIds = new Set(
        hasViewHiddenPropertyIds(currentConfig)
          ? getViewHiddenPropertyIds(currentConfig)
          : isKanbanView
            ? properties.map((property) => property.id)
            : properties
                .filter((property) =>
                  getPropertyHidden(property.property.config),
                )
                .map((property) => property.id),
      );

      if (hiddenPropertyIds.has(propertyId)) {
        hiddenPropertyIds.delete(propertyId);
      } else {
        hiddenPropertyIds.add(propertyId);
      }

      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        hiddenPropertyIds: [...hiddenPropertyIds],
      });

      setLatestViewConfig?.(databaseId, activeView.id, nextConfig);
      updateDatabaseView.mutate({
        config: nextConfig,
        databaseId,
        databaseViewId: activeView.id,
      });
    },
    togglePropertyTitles: () => {
      if (!databaseId || !activeView?.id) {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ??
        activeView.config;
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        showPropertyTitles: !getShowPropertyTitles(currentConfig),
      });

      setLatestViewConfig?.(databaseId, activeView.id, nextConfig);
      updateDatabaseView.mutate({
        config: nextConfig,
        databaseId,
        databaseViewId: activeView.id,
      });
    },
    toggleSortPillVisibility: () => {
      setShowSortPill((visible) => !visible);
    },
    toggleFilterPillVisibility: () => {
      setShowFilterPill((visible) => !visible);
    },
    updateDatabasePropertyConfig: (
      databasePropertyId: string,
      config: unknown,
    ) => {
      if (!databaseId) {
        return Promise.resolve();
      }
      const currentPropertyConfig = payload?.properties.find(
        (property) => property.id === databasePropertyId,
      )?.property.config;
      const nextConfig = getMergedPropertyConfig(
        currentPropertyConfig,
        config as DatabasePropertyConfig,
      );

      const trimUpdates = getRelationLimitTrimUpdates({
        databasePropertyId,
        payload,
        propertyConfig: nextConfig,
      });

      for (const update of trimUpdates) {
        updateValue.mutate({
          databaseId,
          propertyId: update.propertyId,
          rowId: update.rowId,
          value: update.value,
        });
      }

      return updateProperty.mutateAsync({
        config: nextConfig,
        databaseId,
        databasePropertyId,
      });
    },
    updateDatabaseSort: (index: number, patch: Partial<DatabaseSortConfig>) => {
      saveDatabaseSorts(
        activeDatabaseSorts.map(({ column, direction }, sortIndex) =>
          sortIndex === index
            ? { column, direction, ...patch }
            : { column, direction },
        ),
      );
    },
    updateDatabaseFilter: (index: number, patch: DatabaseFilterUpdatePatch) => {
      saveDatabaseFilters(
        getPlainDatabaseFilters().map((filter, filterIndex) => {
          if (filterIndex !== index) {
            return filter;
          }

          if (patch.propertyId && patch.propertyId !== filter.propertyId) {
            const propertyType = getFilterPropertyType(patch.propertyId);
            const operator =
              getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is";

            return {
              ...filter,
              operator,
              propertyId: patch.propertyId,
              values: patch.values ?? [],
            };
          }

          const propertyType = getFilterPropertyType(filter.propertyId);
          const operator = patch.operator
            ? getValidDatabaseFilterOperator(patch.operator, propertyType)
            : filter.operator;

          return {
            ...filter,
            operator,
            values: patch.values ?? filter.values,
          };
        }),
      );
    },
  };
}

function getTimelineGroupPropertyId(currentProperties: DatabaseProperty[]) {
  const groupProperty =
    currentProperties.find((property) => property.property.type === "status") ??
    currentProperties.find(
      (property) =>
        property.property.type !== "status" &&
        isSelectLikePropertyType(property.property.type),
    ) ??
    currentProperties[0] ??
    null;

  return groupProperty?.property.id;
}

function getDatabaseViewCommandsContext({
  addProperty,
  databaseId,
  editable,
  payload,
  properties,
  timelineDateProperty,
}: {
  addProperty: DatabaseMutations["addProperty"];
  databaseId: string | null | undefined;
  editable: boolean;
  payload: DatabasePayload | null | undefined;
  properties: DatabaseProperty[];
  timelineDateProperty: DatabasePropertyListItem | null;
}) {
  return {
    ensureTimelineDatePropertyId: (
      onResolved: (datePropertyId: string) => void,
    ) => {
      const currentProperties = payload?.properties ?? properties;
      const existingDateProperty =
        timelineDateProperty ??
        getTimelineDateProperty(currentProperties, null);

      if (existingDateProperty) {
        onResolved(existingDateProperty.property.id);
        return;
      }

      if (!editable || !databaseId || addProperty.isPending) {
        return;
      }

      addProperty.mutate(
        {
          databaseId,
          name: "Date",
          type: "date",
        },
        {
          onSuccess: (nextPayload) => {
            const createdDateProperty =
              nextPayload.properties.find(
                (property) => property.property.type === "date",
              ) ?? nextPayload.properties.at(-1);

            if (!createdDateProperty) {
              toast.error("Couldn't add date property");
              return;
            }

            onResolved(createdDateProperty.property.id);
          },
          onError: () => {
            toast.error("Couldn't add date property");
          },
        },
      );
    },
  };
}

function createDatabaseFilterId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `filter-${crypto.randomUUID()}`;
  }

  return `filter-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
