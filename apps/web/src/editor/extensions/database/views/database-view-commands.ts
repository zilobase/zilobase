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
  useUpdateDataSource,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
  useUpdateDatabaseView,
} from "@zilobase/features/databases";
import type { useUpdatePage } from "@zilobase/features/pages";

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
  toStringArray,
  type DatabasePropertyValue,
} from "../core/utils";
import {
  areSerializedPropertyValuesEqual,
  hasViewHiddenPropertyIds,
} from "../interactions/database-item-utils";
import type { DatabasePageDragPayload } from "../interactions/database-page-drop";
import {
  getDatabaseFilterOperatorsForType,
  getDatabaseLayoutSettings,
  getDatabaseSubItemsSettings,
  getMergedDatabaseConfig,
  getMergedNameColumnConfig,
  getMergedPropertyConfig,
  getPropertyHidden,
  getShowPropertyTitles,
  getViewHiddenPropertyIds,
  getValidDatabaseFilterOperator,
  type DatabaseConditionalColorConfig,
  type DatabasePropertyFilterConfig,
  type DatabasePropertyConfig,
  type DatabaseLayoutSettings,
  type DatabaseNameColumnConfig,
  type DatabaseSortConfig,
  type DatabaseSubItemsSettings,
} from "./database-view-config";
import type { DatabaseFilterUpdatePatch } from "./database-filter-menu";
import { getRelationLimitTrimUpdates } from "../properties/database-relation-sync";
import {
  defaultDatabaseChartSettings,
  getDatabaseChartSettings,
  type DatabaseChartSettings,
} from "./chart/database-chart-config";
import {
  getDatabaseFormHeaderSettings,
  type DatabaseFormHeaderSettings,
} from "./form/database-form-header-config";
import {
  getDatabaseFormQuestionSettingsById,
  type DatabaseFormQuestionSettingsPatch,
} from "./form/database-form-question-config";
import {
  getDatabaseFormShareSettings,
  type DatabaseFormShareSettings,
} from "./form/database-form-share-config";

type DatabaseMutations = {
  addDatabaseView: ReturnType<typeof useAddDatabaseView>;
  addProperty: ReturnType<typeof useAddDatabaseProperty>;
  addRow: ReturnType<typeof useAddDatabaseRow>;
  updateDatabase: ReturnType<typeof useUpdateDataSource>;
  updateDatabaseView: ReturnType<typeof useUpdateDatabaseView>;
  updatePage: ReturnType<typeof useUpdatePage>;
  updateProperty: ReturnType<typeof useUpdateDatabaseProperty>;
  updateValue: ReturnType<typeof useUpdateDatabasePropertyValue>;
};

type NewRowPropertyValue = {
  propertyId: string;
  value: unknown;
};

type NewRowSetup = {
  parentRelation?: {
    parentPropertyId: string;
    parentRow: DatabaseRow;
    subItemPropertyId: string;
  };
  propertyValues: NewRowPropertyValue[];
  title: string;
};

export type DatabaseViewCommands = ReturnType<typeof getDatabaseViewCommands>;

export function getDatabaseViewCommands({
  activeDatabaseFilters,
  activeDatabaseSorts,
  activeView,
  databaseId,
  viewDatabaseId,
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
  viewDatabaseId?: string | null;
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
    updatePage,
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

  const addRowWithValues = ({
    parentRelation,
    propertyValues,
    title,
  }: NewRowSetup) => {
    if (!editable || !databaseId || addRow.isPending) {
      return;
    }

    const existingItemIds = new Set(items.map((row) => row.id));
    const uniquePropertyValues = new Map(
      propertyValues.map((propertyValue) => [
        propertyValue.propertyId,
        propertyValue,
      ]),
    );

    addRow.mutate(
      {
        databaseId,
        ...(uniquePropertyValues.size > 0
          ? { optimisticValues: [...uniquePropertyValues.values()] }
          : {}),
        title,
      },
      {
        onSuccess: (nextPayload) => {
          const addedItem = findAddedDatabaseRow(
            nextPayload.rows,
            existingItemIds,
          );
          if (!addedItem) {
            return;
          }

          for (const propertyValue of uniquePropertyValues.values()) {
            updateValue.mutate({
              databaseId,
              propertyId: propertyValue.propertyId,
              rowId: addedItem.id,
              value: propertyValue.value,
            });
          }

          if (parentRelation) {
            const currentValue = payload?.values.find(
              (value) =>
                value.pageId === parentRelation.parentRow.pageId &&
                value.propertyId === parentRelation.subItemPropertyId,
            )?.value;
            const nextSubItemPageIds = [
              ...new Set([
                ...toStringArray(currentValue as DatabasePropertyValue),
                addedItem.pageId,
              ]),
            ];

            updateValue.mutate({
              databaseId,
              propertyId: parentRelation.subItemPropertyId,
              rowId: parentRelation.parentRow.id,
              value: nextSubItemPageIds,
            });
          }
        },
      },
    );
  };

  const saveDatabaseSorts = (nextSorts: DatabaseSortConfig[]) => {
    if (!databaseId || !activeView?.id) {
      return Promise.resolve();
    }

    setShowSortPill(nextSorts.length > 0);

    return updateDatabaseView.mutateAsync({
      config: getMergedDatabaseConfig(activeView.config, {
        sorts: nextSorts.length > 0 ? nextSorts : undefined,
      }),
      databaseId: viewDatabaseId ?? databaseId,
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
      databaseId: viewDatabaseId ?? databaseId,
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
      databaseId: viewDatabaseId ?? databaseId,
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

  const updateTimelineDateProperty = (datePropertyId: string | null) => {
    if (!databaseId || !activeView?.id) {
      return;
    }

    updateDatabaseView.mutate({
      config: getMergedDatabaseConfig(activeView.config, {
        datePropertyId: datePropertyId ?? undefined,
      }),
      databaseId: viewDatabaseId ?? databaseId,
      databaseViewId: activeView.id,
    });
  };

  const updateDatabaseChartSettings = (
    settings: Partial<DatabaseChartSettings>,
  ) => {
    if (!databaseId || !activeView?.id) {
      return;
    }

    const currentConfig =
      getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ??
      activeView.config;
    const nextConfig = getMergedDatabaseConfig(currentConfig, {
      chart: {
        ...getDatabaseChartSettings(currentConfig),
        ...settings,
      },
    });

    setLatestViewConfig?.(databaseId, activeView.id, nextConfig);
    updateDatabaseView.mutate({
      config: nextConfig,
      databaseId: viewDatabaseId ?? databaseId,
      databaseViewId: activeView.id,
    });
  };

  const updateDatabaseLayoutSettings = (
    settings: Partial<DatabaseLayoutSettings>,
  ) => {
    if (!databaseId || !activeView?.id) {
      return;
    }

    const currentConfig =
      getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ??
      activeView.config;
    const nextConfig = getMergedDatabaseConfig(currentConfig, {
      layout: {
        ...getDatabaseLayoutSettings(currentConfig),
        ...settings,
      },
    });

    setLatestViewConfig?.(databaseId, activeView.id, nextConfig);
    updateDatabaseView.mutate({
      config: nextConfig,
      databaseId: viewDatabaseId ?? databaseId,
      databaseViewId: activeView.id,
    });
  };

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
      parentRowId?: string | null,
    ) => {
      const defaultStatusValue = defaultStatusOption.name;
      const nextGroupProperty =
        groupPropertyOverride ?? (isKanbanView ? kanbanGroupProperty : null);
      const nextGroupValue =
        groupValue ??
        (isKanbanView && kanbanGroupProperty?.property.type === "status"
          ? defaultStatusValue
          : null);
      const groupSetup = getNewRowGroupSetup(nextGroupValue, nextGroupProperty);
      const subItemsSettings = getDatabaseSubItemsSettings(
        activeView?.config ?? payload?.database.config,
      );
      const parentRow = parentRowId
        ? items.find((row) => row.id === parentRowId)
        : undefined;
      const parentRelation =
        parentRow &&
        subItemsSettings.parentPropertyId &&
        subItemsSettings.subItemPropertyId
          ? {
              parentPropertyId: subItemsSettings.parentPropertyId,
              parentRow,
              subItemPropertyId: subItemsSettings.subItemPropertyId,
            }
          : undefined;
      addRowWithValues({
        ...(parentRelation ? { parentRelation } : {}),
        ...groupSetup,
        ...(parentRelation
          ? {
              propertyValues: [
                ...groupSetup.propertyValues,
                {
                  propertyId: parentRelation.parentPropertyId,
                  value: parentRelation.parentRow.pageId,
                },
              ],
            }
          : {}),
      });
    },
    addDraggedPageRow: async (
      dragPayload: DatabasePageDragPayload,
      position: number,
      groupValue?: string,
      groupPropertyOverride?: DatabasePropertyListItem | null,
    ) => {
      if (!editable || !databaseId || addRow.isPending) {
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

      const isCrossDatabaseMove = Boolean(
        dragPayload.databaseId && dragPayload.databaseId !== databaseId,
      );

      if (isCrossDatabaseMove && !dragPayload.rowId) {
        toast.error("Couldn't identify the source row to move.");
        return;
      }

      const sourcePropertyMode = isCrossDatabaseMove
        ? await getSourcePropertyMode?.(dragPayload)
        : undefined;

      if (sourcePropertyMode === null) {
        return;
      }

      const groupSetup = getDraggedRowGroupSetup(
        groupValue,
        groupPropertyOverride,
      );
      const groupValues = new Map(
        groupSetup.propertyValues.map((propertyValue) => [
          propertyValue.propertyId,
          propertyValue,
        ]),
      );
      const existingItemIds = new Set(items.map((row) => row.id));

      addRow.mutate(
        {
          databaseId,
          ...(groupValues.size > 0
            ? { optimisticValues: [...groupValues.values()] }
            : {}),
          pageId: dragPayload.pageId,
          position,
          sourceDataSourceId: isCrossDatabaseMove
            ? dragPayload.databaseId
            : undefined,
          sourceRowId: isCrossDatabaseMove ? dragPayload.rowId : undefined,
          sourcePropertyMode: sourcePropertyMode ?? undefined,
          title: groupSetup.pageTitle ?? dragPayload.title,
        },
        {
          onError: () => {
            toast.error("Couldn't move this row to the database.");
          },
          onSuccess: (nextPayload) => {
            const addedItem = findAddedDatabaseRow(
              nextPayload.rows,
              existingItemIds,
            );
            if (!addedItem) return;

            if (groupSetup.pageTitle !== undefined) {
              updatePage.mutate(
                { id: dragPayload.pageId, name: groupSetup.pageTitle },
                {
                  onError: () =>
                    toast.error(
                      "Moved the row, but couldn't update its group.",
                    ),
                },
              );
            }

            for (const propertyValue of groupValues.values()) {
              updateValue.mutate({
                databaseId,
                propertyId: propertyValue.propertyId,
                rowId: addedItem.id,
                value: propertyValue.value,
              });
            }
          },
        },
      );
    },
    addChartView: () => {
      if (!editable || !databaseId || addDatabaseView.isPending) {
        return;
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id),
      );

      addDatabaseView.mutate(
        {
          config: {
            chart: {
              ...defaultDatabaseChartSettings,
              valueColors: {},
            },
          },
          databaseId: viewDatabaseId ?? databaseId,
          dataSourceId: databaseId ?? undefined,
          name: "Chart",
          type: "chart",
        },
        {
          onSuccess: (nextPayload) => {
            const addedView =
              nextPayload.views.find((view) => !existingViewIds.has(view.id)) ??
              nextPayload.views.at(-1);

            setActiveViewId(addedView?.id ?? null);
          },
          onError: () => {
            toast.error("Couldn't add chart view");
          },
        },
      );
    },
    addGalleryView: () => {
      if (!editable || !databaseId || addDatabaseView.isPending) {
        return;
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id),
      );

      addDatabaseView.mutate(
        {
          databaseId: viewDatabaseId ?? databaseId,
          dataSourceId: databaseId ?? undefined,
          name: "Gallery",
          type: "gallery",
        },
        {
          onSuccess: (nextPayload) => {
            const addedView =
              nextPayload.views.find((view) => !existingViewIds.has(view.id)) ??
              nextPayload.views.at(-1);

            setActiveViewId(addedView?.id ?? null);
          },
          onError: () => {
            toast.error("Couldn't add gallery view");
          },
        },
      );
    },
    addFormView: (hiddenPropertyIds: string[]) => {
      if (!editable || !databaseId || addDatabaseView.isPending) {
        return;
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id),
      );

      addDatabaseView.mutate(
        {
          config: { hiddenPropertyIds },
          databaseId: viewDatabaseId ?? databaseId,
          dataSourceId: databaseId ?? undefined,
          name: "Form",
          type: "form",
        },
        {
          onSuccess: (nextPayload) => {
            const addedView =
              nextPayload.views.find((view) => !existingViewIds.has(view.id)) ??
              nextPayload.views.at(-1);

            setActiveViewId(addedView?.id ?? null);
          },
          onError: () => {
            toast.error("Couldn't add form view");
          },
        },
      );
    },
    addKanbanView: () => {
      if (!editable || !databaseId || addDatabaseView.isPending) {
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
            databaseId: viewDatabaseId ?? databaseId,
            dataSourceId: databaseId ?? undefined,
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
    addListView: () => {
      if (!editable || !databaseId || addDatabaseView.isPending) {
        return;
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id),
      );

      addDatabaseView.mutate(
        {
          databaseId: viewDatabaseId ?? databaseId,
          dataSourceId: databaseId ?? undefined,
          name: "List",
          type: "list",
        },
        {
          onSuccess: (nextPayload) => {
            const addedView =
              nextPayload.views.find((view) => !existingViewIds.has(view.id)) ??
              nextPayload.views.at(-1);

            setActiveViewId(addedView?.id ?? null);
          },
          onError: () => {
            toast.error("Couldn't add list view");
          },
        },
      );
    },
    addTimelineRow: (
      startAt: Date,
      endAt: Date,
      groupValue?: string,
      groupProperty?: DatabasePropertyListItem | null,
    ) => {
      if (!timelineDateProperty) {
        return;
      }

      const groupSetup = getNewRowGroupSetup(groupValue, groupProperty);
      addRowWithValues({
        propertyValues: [
          {
            propertyId: timelineDateProperty.property.id,
            value: ganttMoveToDateValue(startAt, endAt),
          },
          ...groupSetup.propertyValues,
        ],
        title: groupSetup.title,
      });
    },
    addTimelineView: () => {
      if (
        !editable ||
        !databaseId ||
        addDatabaseView.isPending ||
        addProperty.isPending
      ) {
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
            databaseId: viewDatabaseId ?? databaseId,
            dataSourceId: databaseId ?? undefined,
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
      if (!editable || !databaseId || addDatabaseView.isPending) {
        return;
      }

      const existingViewIds = new Set(
        (payload?.views ?? []).map((view) => view.id),
      );

      addDatabaseView.mutate(
        {
          databaseId: viewDatabaseId ?? databaseId,
          dataSourceId: databaseId ?? undefined,
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
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    setViewDateProperty: (datePropertyId: string | null) => {
      updateTimelineDateProperty(datePropertyId);
    },
    setupTimelineDateProperty: () => {
      if (!databaseId || !activeView?.id) {
        return;
      }

      ensureTimelineDatePropertyId((datePropertyId) => {
        updateTimelineDateProperty(datePropertyId);
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
        databaseId: viewDatabaseId ?? databaseId,
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
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
        name: nextTitle,
      });
    },
    setViewType: (
      type:
        | "table"
        | "kanban"
        | "timeline"
        | "chart"
        | "gallery"
        | "list"
        | "form",
    ) => {
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
            databaseId: viewDatabaseId ?? databaseId,
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
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
        type,
      });
    },
    updateDatabaseChartSettings,
    updateDatabaseLayoutSettings,
    updateDatabaseFormHeaderSettings: (
      settings: Partial<DatabaseFormHeaderSettings>,
    ) => {
      if (
        !editable ||
        !databaseId ||
        !activeView?.id ||
        activeView.type !== "form"
      ) {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ??
        activeView.config;
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        formHeader: {
          ...getDatabaseFormHeaderSettings(currentConfig),
          ...settings,
        },
      });

      setLatestViewConfig?.(databaseId, activeView.id, nextConfig);
      updateDatabaseView.mutate({
        config: nextConfig,
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    updateDatabaseFormQuestionSettings: (
      propertyId: string,
      settings: DatabaseFormQuestionSettingsPatch,
    ) => {
      if (
        !editable ||
        !databaseId ||
        !activeView?.id ||
        activeView.type !== "form"
      ) {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ??
        activeView.config;
      const currentQuestions =
        getDatabaseFormQuestionSettingsById(currentConfig);
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        formQuestions: {
          ...currentQuestions,
          [propertyId]: {
            ...currentQuestions[propertyId],
            ...settings,
          },
        },
      });

      setLatestViewConfig?.(databaseId, activeView.id, nextConfig);
      updateDatabaseView.mutate({
        config: nextConfig,
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    updateDatabaseFormShareSettings: (
      settings: Partial<DatabaseFormShareSettings>,
    ) => {
      if (!databaseId || !activeView?.id || activeView.type !== "form") {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ??
        activeView.config;
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        formShare: {
          ...getDatabaseFormShareSettings(currentConfig),
          ...settings,
        },
      });

      setLatestViewConfig?.(databaseId, activeView.id, nextConfig);
      updateDatabaseView.mutate({
        config: nextConfig,
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    updateDatabaseSubItemsSettings: (
      settings: Partial<DatabaseSubItemsSettings>,
    ) => {
      if (!databaseId || !activeView?.id) {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ??
        activeView.config;
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        subItems: {
          ...getDatabaseSubItemsSettings(currentConfig),
          ...settings,
        },
      });

      setLatestViewConfig?.(databaseId, activeView.id, nextConfig);
      updateDatabaseView.mutate({
        config: nextConfig,
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    updateNameColumnConfig: (config: DatabaseNameColumnConfig) => {
      if (!editable || !databaseId) {
        return;
      }

      updateDatabase.mutate({
        config: getMergedNameColumnConfig(payload?.database.config, config),
        databaseId,
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
        databaseId: viewDatabaseId ?? databaseId,
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
        databaseId: viewDatabaseId ?? databaseId,
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

function getNewRowGroupSetup(
  groupValue?: string | null,
  groupProperty?: DatabasePropertyListItem | null,
): NewRowSetup {
  if (!groupValue || !groupProperty) {
    return { propertyValues: [], title: "Untitled" };
  }

  if (groupProperty.id === "name") {
    return { propertyValues: [], title: groupValue };
  }

  if (!canUpdateKanbanGroupProperty(groupProperty)) {
    return { propertyValues: [], title: "Untitled" };
  }

  return {
    propertyValues: [
      {
        propertyId: groupProperty.property.id,
        value: serializePropertyValue(groupProperty.property.type, groupValue),
      },
    ],
    title: "Untitled",
  };
}

function getDraggedRowGroupSetup(
  groupValue?: string,
  groupProperty?: DatabasePropertyListItem | null,
): NewRowSetup & { pageTitle?: string } {
  if (groupValue === undefined || !groupProperty) {
    return { propertyValues: [], title: "Untitled" };
  }

  if (groupProperty.id === "name") {
    return {
      pageTitle: groupValue,
      propertyValues: [],
      title: groupValue,
    };
  }

  if (!canUpdateKanbanGroupProperty(groupProperty)) {
    return { propertyValues: [], title: "Untitled" };
  }

  return {
    propertyValues: [
      {
        propertyId: groupProperty.property.id,
        value: serializePropertyValue(groupProperty.property.type, groupValue),
      },
    ],
    title: "Untitled",
  };
}

function findAddedDatabaseRow(
  rows: DatabaseRow[],
  existingRowIds: Set<string>,
) {
  return rows.find((row) => !existingRowIds.has(row.id)) ?? rows.at(-1);
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
