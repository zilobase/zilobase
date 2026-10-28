import { diffConfiguration } from "../interactions/configuration";
import { getConvertedViewConfig, removeDatabaseGroupProperty } from "../views/type-transition";
import { observeDatabaseViewCreation, observeOperation } from "./mutation-bindings";

import type { DatabasePropertyEntity, DatabaseViewEntity } from "../core/entities";
import type { DatabaseRow } from "../core/export-payload";
import type { DatabaseViewData } from "../views/source-state";

import {
  areSerializedPropertyValuesEqual,
  hasViewHiddenPropertyIds,
} from "../interactions/item-utils";
import type { DatabasePropertyFilterConfig } from "../schema/filter";
import {
  getDatabaseFilterOperatorsForType,
  getValidDatabaseFilterOperator,
  isDatabaseFilterGroup,
} from "../schema/filter";
import {
  getEffectiveStatusValue,
  getDefaultDatabasePropertyConfig,
} from "../schema/property-defaults";
import type { DatabasePropertyValue } from "../schema/property-values";
import { serializePropertyValue } from "../schema/property-values";
import { getRelationLimitTrimUpdates, relationPayloadFromViewData } from "../schema/relations";
import type { DatabaseChartSettings } from "../views/chart-config";
import { defaultDatabaseChartSettings, getDatabaseChartSettings } from "../views/chart-config";
import type {
  DatabaseConditionalColorConfig,
  DatabaseLayoutSettings,
  DatabaseNameColumnConfig,
  DatabasePropertyConfig,
  DatabaseSortConfig,
  DatabaseSubItemsSettings,
} from "../views/configuration";
import {
  getDatabaseFilters,
  getDatabaseLayoutSettings,
  getDatabaseSorts,
  getDatabaseSubItemsSettings,
  getMergedDatabaseConfig,
  getMergedNameColumnConfig,
  getMergedPropertyConfig,
  getPropertyHidden,
  getShowPropertyTitles,
  getViewHiddenPropertyIds,
} from "../views/configuration";
import type { DatabaseFilterUpdatePatch } from "../views/contracts";
import type {
  DatabaseFormHeaderSettings,
  DatabaseFormQuestionSettingsPatch,
  DatabaseFormShareSettings,
} from "../views/form";
import {
  getDatabaseFormHeaderSettings,
  getDatabaseFormQuestionSettingsById,
  getDatabaseFormShareSettings,
} from "../views/form";
import type { DatabasePropertyListItem } from "../views/grouping";
import { getGroupPropertyId, getKanbanGroupProperty } from "../views/grouping";
import { getDefaultKanbanHiddenPropertyIds } from "../views/kanban-group-settings";
import { ganttMoveToDateValue, getTimelineDateProperty } from "../views/timeline-date";
import type { DatabasePageDragPayload } from "./page-drop";

import {
  calendarScheduleToValue,
  getCalendarDateProperty,
  type DatabaseCalendarMode,
  type DatabaseCalendarSchedule,
} from "../views/calendar";
import type { DatabaseMutations } from "./mutation-bindings";
import { createAddDatabaseRowMutation } from "./row-mutations";
import {
  getDraggedRowGroupSetup,
  getNewRowGroupSetup,
  getTimelineGroupPropertyId,
} from "./row-plans";

export type DatabaseViewCommands = ReturnType<typeof createDatabaseViewCommands>;

export function createDatabaseViewCommands({
  pending = {},
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
  notify,
  viewData,
  properties,
  onViewCreated,
  onSortsChanged,
  getLatestViewConfig,
  getSourcePropertyMode,
  isCurrent = () => true,
}: {
  pending?: Partial<Record<keyof DatabaseMutations, boolean>>;
  activeDatabaseFilters: DatabasePropertyFilterConfig[];
  activeDatabaseSorts: DatabaseSortConfig[];
  activeView: DatabaseViewEntity | null;
  databaseId: string | null | undefined;
  viewDatabaseId?: string | null;
  editable: boolean;
  isKanbanView: boolean;
  items: DatabaseRow[];
  kanbanGroupProperty: DatabasePropertyListItem | null;
  timelineDateProperty: DatabasePropertyListItem | null;
  mutations: DatabaseMutations;
  notify: { error: (message: string) => void; success: (message: string) => void };
  viewData: DatabaseViewData | null | undefined;
  properties: DatabasePropertyEntity[];
  onViewCreated: (viewId: string) => void;
  onSortsChanged: (hasSorts: boolean) => void;
  getLatestViewConfig?: (
    databaseId: string,
    databaseViewId: string,
    fallbackConfig: unknown,
  ) => unknown;
  isCurrent?: () => boolean;
  getSourcePropertyMode?: (
    dragPayload: DatabasePageDragPayload,
  ) => Promise<"duplicate" | "match" | null>;
}) {
  const {
    addDatabaseView,
    addProperty,
    addRow,
    changeRow,
    updateDatabase,
    updateDatabaseView,
    updateProperty,
    updateValue,
  } = mutations;
  const databaseConfig = viewData?.bootstrap.database.config;
  const databasePageId = viewData?.bootstrap.database.pageId;
  const databaseName = viewData?.activeDataSource?.name;
  const viewProperties = viewData
    ? viewData.bootstrap.properties.filter(
        (property) => property.dataSourceId === viewData.dataSourceId,
      )
    : null;
  const ensureTimelineDatePropertyId = createTimelineDateResolver({
    pending,
    addProperty,
    databaseId,
    editable,
    viewData,
    properties,
    timelineDateProperty,
    config: activeView?.config,
    isCurrent,
    notify,
  });

  let resolvingKanbanProperty = false;
  const ensureKanbanGroupProperty = (
    onResolved: (
      property: DatabasePropertyEntity,
      currentProperties: DatabasePropertyEntity[],
    ) => void,
    optimistic = false,
  ) => {
    const currentProperties = viewProperties ?? properties;
    const existing = getKanbanGroupProperty(
      currentProperties,
      activeView?.type === "kanban" ? latestConfig() : null,
    );
    if (existing) {
      onResolved(existing, currentProperties);
      return;
    }
    if (!editable || !databaseId || pending.addProperty || resolvingKanbanProperty) return;
    resolvingKanbanProperty = true;
    let resolved = false;
    const resolve = (created: DatabasePropertyEntity) => {
      if (resolved || !isCurrent()) return;
      resolved = true;
      onResolved(created, [...currentProperties, created]);
    };
    observeOperation(
      addProperty,
      {
        databaseId,
        name: "Status",
        type: "status",
        config: getDefaultDatabasePropertyConfig("status"),
        ...(optimistic ? { onOptimistic: resolve } : {}),
      },
      {
        onSuccess: (created) => {
          resolvingKanbanProperty = false;
          resolve(created);
        },
        onError: () => {
          resolvingKanbanProperty = false;
          if (isCurrent()) notify.error("Couldn't add status property");
        },
      },
    );
  };

  const addRowWithValues = createAddDatabaseRowMutation({
    addRow,
    databaseId,
    editable,
    hostDatabaseId: viewDatabaseId,
  });

  const saveDatabaseSorts = (nextSorts: DatabaseSortConfig[]) => {
    if (!databaseId || !activeView?.id) {
      return Promise.resolve();
    }

    onSortsChanged(nextSorts.length > 0);
    const currentConfig = latestConfig();

    return updateDatabaseView({
      configuration: diffConfiguration(
        currentConfig,
        getMergedDatabaseConfig(currentConfig, {
          sorts: nextSorts.length > 0 ? nextSorts : undefined,
        }),
      ),
      databaseId: viewDatabaseId ?? databaseId,
      databaseViewId: activeView.id,
    });
  };

  const saveDatabaseFilters = (nextFilters: DatabasePropertyFilterConfig[]) => {
    if (!databaseId || !activeView?.id) {
      return;
    }

    const currentConfig = latestConfig();
    observeOperation(updateDatabaseView, {
      configuration: diffConfiguration(
        currentConfig,
        getMergedDatabaseConfig(currentConfig, {
          filters: nextFilters.length > 0 ? nextFilters : undefined,
        }),
      ),
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

    observeOperation(updateDatabaseView, {
      configuration: diffConfiguration(
        activeView.config,
        getMergedDatabaseConfig(activeView.config, {
          conditionalColors: nextConditionalColors.length > 0 ? nextConditionalColors : undefined,
        }),
      ),
      databaseId: viewDatabaseId ?? databaseId,
      databaseViewId: activeView.id,
    });
  };

  const getFilterPropertyType = (propertyId: DatabasePropertyFilterConfig["propertyId"]) => {
    if (propertyId === "name") {
      return "text";
    }

    return properties.find((property) => property.id === propertyId)?.property.type ?? "text";
  };

  const createDatabaseFilter = (
    propertyId: DatabasePropertyFilterConfig["propertyId"],
  ): DatabasePropertyFilterConfig => {
    const propertyType = getFilterPropertyType(propertyId);

    return {
      id: createDatabaseFilterId(),
      operator: getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is",
      propertyId,
      values: [],
    };
  };

  const latestConfig = () =>
    activeView && databaseId && getLatestViewConfig
      ? getLatestViewConfig(viewDatabaseId ?? databaseId, activeView.id, activeView.config)
      : activeView?.config;
  const latestSorts = () =>
    getLatestViewConfig ? getDatabaseSorts(latestConfig()) : activeDatabaseSorts;
  const getPlainDatabaseFilters = () =>
    (getLatestViewConfig
      ? getDatabaseFilters(latestConfig()).filter(
          (filter): filter is DatabasePropertyFilterConfig => !isDatabaseFilterGroup(filter),
        )
      : activeDatabaseFilters
    ).map(({ id, operator, propertyId, values }) => ({
      id,
      operator: getValidDatabaseFilterOperator(operator, getFilterPropertyType(propertyId)),
      propertyId,
      values,
    }));

  const updateTimelineDateProperty = (datePropertyId: string | null) => {
    if (!databaseId || !activeView?.id) {
      return;
    }

    observeOperation(updateDatabaseView, {
      configuration: diffConfiguration(
        activeView.config,
        getMergedDatabaseConfig(activeView.config, {
          datePropertyId: datePropertyId ?? undefined,
        }),
      ),
      databaseId: viewDatabaseId ?? databaseId,
      databaseViewId: activeView.id,
    });
  };

  const updateDatabaseChartSettings = (settings: Partial<DatabaseChartSettings>) => {
    if (!databaseId || !activeView?.id) {
      return;
    }

    const currentConfig =
      getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
    const nextConfig = getMergedDatabaseConfig(currentConfig, {
      chart: {
        ...getDatabaseChartSettings(currentConfig),
        ...settings,
      },
    });

    observeOperation(updateDatabaseView, {
      configuration: diffConfiguration(currentConfig, nextConfig),
      databaseId: viewDatabaseId ?? databaseId,
      databaseViewId: activeView.id,
    });
  };

  const updateDatabaseLayoutSettings = (settings: Partial<DatabaseLayoutSettings>) => {
    if (!databaseId || !activeView?.id) {
      return;
    }

    const currentConfig =
      getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
    const nextConfig = getMergedDatabaseConfig(currentConfig, {
      layout: {
        ...getDatabaseLayoutSettings(currentConfig),
        ...settings,
      },
    });

    observeOperation(updateDatabaseView, {
      configuration: diffConfiguration(currentConfig, nextConfig),
      databaseId: viewDatabaseId ?? databaseId,
      databaseViewId: activeView.id,
    });
  };

  return {
    addCalendarRow: async (schedule: DatabaseCalendarSchedule) => {
      const dateProperty = getCalendarDateProperty(
        viewProperties ?? properties,
        activeView?.config,
      );
      if (!editable || !databaseId || !dateProperty)
        throw new Error("Calendar is not editable or has no date property");
      const row = await addRow({
        databaseId,
        ...(viewDatabaseId ? { hostDatabaseId: viewDatabaseId } : {}),
        title: "",
        initialValues: [
          {
            propertyId: dateProperty.property.id,
            value: serializePropertyValue("date", calendarScheduleToValue(schedule)),
          },
        ],
      });
      return { rowId: row.id, pageId: row.pageId };
    },
    addCalendarView: () => {
      if (!editable || !databaseId || pending.addDatabaseView || pending.addProperty) return;
      ensureTimelineDatePropertyId((datePropertyId) => {
        observeDatabaseViewCreation(
          addDatabaseView,
          {
            config: { datePropertyId, calendarView: "month" },
            databaseId: viewDatabaseId ?? databaseId,
            dataSourceId: databaseId,
            name: "Calendar",
            type: "calendar",
          },
          {
            onSuccess: (view) => onViewCreated(view.id),
            onError: () => notify.error("Couldn't add calendar view"),
          },
        );
      }, true);
    },
    setCalendarMode: (calendarView: DatabaseCalendarMode) => {
      if (!editable || !databaseId || !activeView) return;
      const config = latestConfig();
      observeOperation(updateDatabaseView, {
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
        configuration: diffConfiguration(config, getMergedDatabaseConfig(config, { calendarView })),
      });
    },
    addDatabaseProperty: (type = "text", label = "Property", position?: number) => {
      if (!editable || !databaseId) {
        return;
      }

      observeOperation(addProperty, {
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
      const defaultStatusValue = getEffectiveStatusValue(
        null,
        kanbanGroupProperty?.property.config,
      );
      const nextGroupProperty =
        groupPropertyOverride ?? (isKanbanView ? kanbanGroupProperty : null);
      const nextGroupValue =
        groupValue ??
        (isKanbanView && kanbanGroupProperty?.property.type === "status"
          ? defaultStatusValue
          : null);
      const groupSetup = getNewRowGroupSetup(nextGroupValue, nextGroupProperty);
      const subItemsSettings = getDatabaseSubItemsSettings(activeView?.config ?? databaseConfig);
      if (
        parentRowId &&
        (!subItemsSettings.parentPropertyId || !subItemsSettings.subItemPropertyId)
      ) {
        notify.error("Sub-items are still being set up. Try again shortly.");
        return;
      }
      const parentRow = parentRowId ? items.find((row) => row.id === parentRowId) : undefined;
      if (parentRowId && !parentRow) {
        notify.error("Parent item is no longer available.");
        return;
      }
      const parentRelation =
        parentRow && subItemsSettings.parentPropertyId && subItemsSettings.subItemPropertyId
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
      clearSortViewId?: string,
    ) => {
      if (!editable || !databaseId) {
        return;
      }

      if (dragPayload.pageId === databasePageId) {
        notify.error("You can't nest a page inside itself.");
        return;
      }

      const groupSetup = getDraggedRowGroupSetup(groupValue, groupPropertyOverride);
      if (dragPayload.databaseId === databaseId && dragPayload.rowId && viewDatabaseId) {
        const previousIndex = items.findIndex(({ id }) => id === dragPayload.rowId);
        const remaining = items.filter(({ id }) => id !== dragPayload.rowId);
        const index = Math.max(
          0,
          Math.min(
            position - (previousIndex >= 0 && previousIndex < position ? 1 : 0),
            remaining.length,
          ),
        );
        observeOperation(
          changeRow,
          {
            databaseId: viewDatabaseId,
            dataSourceId: databaseId,
            rowId: dragPayload.rowId,
            ...(clearSortViewId ? { clearSortViewId } : {}),
            placement: {
              afterRowId: remaining[index - 1]?.id ?? null,
              beforeRowId: remaining[index]?.id ?? null,
            },
            title: groupSetup.pageTitle,
            valuesByPropertyId: Object.fromEntries(
              groupSetup.propertyValues.map(({ propertyId, value }) => [propertyId, value]),
            ),
          },
          { onError: () => notify.error("Couldn't move this row.") },
        );
        return;
      }
      if (items.some((row) => row.pageId === dragPayload.pageId)) {
        notify.error("This page is already in this database.");
        return;
      }

      const isCrossDatabaseMove = Boolean(
        dragPayload.databaseId && dragPayload.databaseId !== databaseId,
      );

      if (isCrossDatabaseMove && !dragPayload.rowId) {
        notify.error("Couldn't identify the source row to move.");
        return;
      }

      const sourcePropertyMode = isCrossDatabaseMove
        ? await getSourcePropertyMode?.(dragPayload)
        : undefined;

      if (sourcePropertyMode === null) {
        return;
      }

      const groupValues = new Map(
        groupSetup.propertyValues.map((propertyValue) => [propertyValue.propertyId, propertyValue]),
      );
      observeOperation(
        addRow,
        {
          databaseId,
          ...(viewDatabaseId ? { hostDatabaseId: viewDatabaseId } : {}),
          ...(groupValues.size > 0 ? { initialValues: [...groupValues.values()] } : {}),
          pageId: dragPayload.pageId,
          ...(clearSortViewId ? { clearSortViewId } : {}),
          afterRowId: items[position - 1]?.id ?? null,
          beforeRowId: items[position]?.id ?? null,
          sourceHostDatabaseId: dragPayload.hostDatabaseId,
          sourceDataSourceId: isCrossDatabaseMove ? dragPayload.databaseId : undefined,
          sourceRowId: isCrossDatabaseMove ? dragPayload.rowId : undefined,
          sourcePropertyMode: sourcePropertyMode ?? undefined,
          previewTitle: dragPayload.title,
          title: groupSetup.pageTitle,
        },
        {
          onError: () => {
            notify.error("Couldn't move this row to the database.");
          },
        },
      );
    },
    addChartView: () => {
      if (!editable || !databaseId || pending.addDatabaseView) {
        return;
      }

      observeDatabaseViewCreation(
        addDatabaseView,
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
          onSuccess: (view) => {
            onViewCreated(view.id);
          },
          onError: () => {
            notify.error("Couldn't add chart view");
          },
        },
      );
    },
    addGalleryView: () => {
      if (!editable || !databaseId || pending.addDatabaseView) {
        return;
      }

      observeDatabaseViewCreation(
        addDatabaseView,
        {
          databaseId: viewDatabaseId ?? databaseId,
          dataSourceId: databaseId ?? undefined,
          name: "Gallery",
          type: "gallery",
        },
        {
          onSuccess: (view) => {
            onViewCreated(view.id);
          },
          onError: () => {
            notify.error("Couldn't add gallery view");
          },
        },
      );
    },
    addFormView: (hiddenPropertyIds: string[]) => {
      if (!editable || !databaseId || pending.addDatabaseView) {
        return;
      }

      observeDatabaseViewCreation(
        addDatabaseView,
        {
          config: { hiddenPropertyIds },
          databaseId: viewDatabaseId ?? databaseId,
          dataSourceId: databaseId ?? undefined,
          name: "Form",
          type: "form",
        },
        {
          onSuccess: (view) => {
            onViewCreated(view.id);
          },
          onError: () => {
            notify.error("Couldn't add form view");
          },
        },
      );
    },
    addKanbanView: () => {
      if (!editable || !databaseId || pending.addDatabaseView || pending.addProperty) return;
      ensureKanbanGroupProperty((groupProperty, currentProperties) => {
        const groupPropertyId = groupProperty.property.id;
        observeDatabaseViewCreation(
          addDatabaseView,
          {
            config: {
              groupPropertyId,
              hiddenPropertyIds: getDefaultKanbanHiddenPropertyIds(
                currentProperties,
                groupPropertyId,
              ),
            },
            databaseId: viewDatabaseId ?? databaseId,
            dataSourceId: databaseId,
            name: "Kanban",
            type: "kanban",
          },
          {
            onSuccess: (view) => onViewCreated(view.id),
            onError: () => notify.error("Couldn't add kanban view"),
          },
        );
      }, true);
    },
    addListView: () => {
      if (!editable || !databaseId || pending.addDatabaseView) {
        return;
      }

      observeDatabaseViewCreation(
        addDatabaseView,
        {
          databaseId: viewDatabaseId ?? databaseId,
          dataSourceId: databaseId ?? undefined,
          name: "List",
          type: "list",
        },
        {
          onSuccess: (view) => {
            onViewCreated(view.id);
          },
          onError: () => {
            notify.error("Couldn't add list view");
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
      if (!editable || !databaseId || pending.addDatabaseView || pending.addProperty) {
        return;
      }

      ensureTimelineDatePropertyId((datePropertyId) => {
        const currentProperties = viewProperties ?? properties;
        const groupPropertyId = getTimelineGroupPropertyId(currentProperties);

        observeDatabaseViewCreation(
          addDatabaseView,
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
            onSuccess: (view) => {
              onViewCreated(view.id);
            },
            onError: () => {
              notify.error("Couldn't add timeline view");
            },
          },
        );
      }, true);
    },
    addTableView: () => {
      if (!editable || !databaseId || pending.addDatabaseView) {
        return;
      }

      observeDatabaseViewCreation(
        addDatabaseView,
        {
          databaseId: viewDatabaseId ?? databaseId,
          dataSourceId: databaseId ?? undefined,
          name: "Table",
          type: "table",
        },
        {
          onSuccess: (view) => {
            onViewCreated(view.id);
          },
          onError: () => {
            notify.error("Couldn't add table view");
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
    setViewGroupProperty: (groupPropertyId: string | null) => {
      if (!databaseId || !activeView?.id) {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
      let nextConfig = getMergedDatabaseConfig(currentConfig, {
        groupPropertyId: groupPropertyId ?? undefined,
      });

      if (groupPropertyId === null) {
        nextConfig = removeDatabaseGroupProperty(nextConfig);
      }

      if (isKanbanView) {
        const currentGroupPropertyId =
          getGroupPropertyId(currentConfig) ?? kanbanGroupProperty?.property.id ?? null;
        const hiddenPropertyIds = new Set(
          hasViewHiddenPropertyIds(currentConfig)
            ? getViewHiddenPropertyIds(currentConfig)
            : getDefaultKanbanHiddenPropertyIds(properties, currentGroupPropertyId),
        );
        const previousGroupProperty = properties.find(
          (property) => property.property.id === currentGroupPropertyId,
        );
        const nextGroupProperty = properties.find(
          (property) => property.property.id === groupPropertyId,
        );

        if (previousGroupProperty) {
          hiddenPropertyIds.delete(previousGroupProperty.id);
        }
        if (nextGroupProperty) {
          hiddenPropertyIds.add(nextGroupProperty.id);
        }

        nextConfig = getMergedDatabaseConfig(nextConfig, {
          hiddenPropertyIds: [...hiddenPropertyIds],
        });
      }

      observeOperation(updateDatabaseView, {
        configuration: diffConfiguration(currentConfig, nextConfig),
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    setViewDateProperty: (datePropertyId: string | null) => {
      updateTimelineDateProperty(datePropertyId);
    },
    setupRequiredViewProperties: () => {
      if (!editable || !databaseId || !activeView || !isCurrent() || pending.updateDatabaseView)
        return;
      if (activeView.type === "kanban") {
        ensureKanbanGroupProperty((groupProperty, currentProperties) => {
          if (!isCurrent()) return;
          const currentConfig = latestConfig();
          observeOperation(
            updateDatabaseView,
            {
              databaseId: viewDatabaseId ?? databaseId,
              databaseViewId: activeView.id,
              configuration: diffConfiguration(
                currentConfig,
                getConvertedViewConfig({
                  currentConfig,
                  type: "kanban",
                  previousType: "kanban",
                  kanbanGroupProperty: groupProperty,
                  properties: currentProperties,
                }),
              ),
            },
            {
              onError: () => {
                if (isCurrent()) notify.error("Couldn't configure view grouping");
              },
            },
          );
        });
      } else if (activeView.type === "timeline" || activeView.type === "calendar") {
        ensureTimelineDatePropertyId(updateTimelineDateProperty);
      }
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
        ...latestSorts().map(({ column, direction }) => ({
          column,
          direction,
        })),
        {
          column: field,
          direction: "ascending",
        },
      ]);
    },
    createDatabaseFilter: (field: string) => {
      if (getPlainDatabaseFilters().some((filter) => filter.propertyId === field)) {
        return;
      }

      saveDatabaseFilters([...getPlainDatabaseFilters(), createDatabaseFilter(field)]);
    },
    removeDatabaseFilter: (index: number) => {
      saveDatabaseFilters(
        getPlainDatabaseFilters().filter(
          (filter) => filter.id !== activeDatabaseFilters[index]?.id,
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
      const remainingFilters = filters.filter((filter) => !filterIds.includes(filter.id));

      saveDatabaseFilters([...reorderedFilters, ...remainingFilters]);
    },
    removeDatabaseSort: (index: number) => {
      saveDatabaseSorts(
        latestSorts().flatMap(({ column, direction }) =>
          column === activeDatabaseSorts[index]?.column ? [] : [{ column, direction }],
        ),
      );
    },
    renameDatabaseProperty: (databasePropertyId: string, name: string) => {
      if (!databaseId) {
        return;
      }

      observeOperation(updateProperty, {
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

      const validPropertyIds = new Set(["name", ...properties.map((property) => property.id)]);
      const seenPropertyIds = new Set<string>();
      const orderedPropertyIds = propertyIds.filter((propertyId) => {
        if (!validPropertyIds.has(propertyId) || seenPropertyIds.has(propertyId)) {
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
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        propertyOrder,
      });

      observeOperation(updateDatabaseView, {
        configuration: diffConfiguration(currentConfig, nextConfig),
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    saveDatabaseSorts,
    saveDatabaseEmoji: (nextEmoji: string) => {
      if (!editable || !databaseId) {
        return;
      }

      observeOperation(updateDatabase, {
        configuration: diffConfiguration(
          databaseConfig,
          getMergedDatabaseConfig(databaseConfig, {
            emoji: nextEmoji,
          }),
        ),
        databaseId,
      });
    },
    saveDatabaseTitle: (nextTitle: string) => {
      if (!databaseId || nextTitle === databaseName) {
        return;
      }

      observeOperation(updateDatabase, {
        databaseId,
        name: nextTitle,
      });
    },
    saveDatabaseViewTitle: (nextTitle: string) => {
      if (!databaseId || !activeView?.id || nextTitle === activeView.name) {
        return;
      }

      observeOperation(updateDatabaseView, {
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
        name: nextTitle,
      });
    },
    setViewType: (
      type: "table" | "kanban" | "timeline" | "calendar" | "chart" | "gallery" | "list" | "form",
    ) => {
      if (
        !editable ||
        !databaseId ||
        !activeView?.id ||
        type === activeView.type ||
        pending.updateDatabaseView
      ) {
        return;
      }

      const changeType = (nextConfig: unknown, currentConfig = latestConfig()) => {
        if (!isCurrent()) return;
        observeOperation(
          updateDatabaseView,
          {
            configuration: diffConfiguration(currentConfig, nextConfig),
            databaseId: viewDatabaseId ?? databaseId,
            databaseViewId: activeView.id,
            type,
          },
          { onError: () => notify.error("Couldn't change view layout") },
        );
      };

      if (type === "kanban") {
        ensureKanbanGroupProperty((groupProperty, currentProperties) => {
          const currentConfig = latestConfig();
          changeType(
            getConvertedViewConfig({
              currentConfig,
              type,
              previousType: activeView.type,
              kanbanGroupProperty: groupProperty,
              properties: currentProperties,
            }),
            currentConfig,
          );
        });
        return;
      }

      if (type === "timeline" || type === "calendar") {
        ensureTimelineDatePropertyId((datePropertyId) => {
          const currentConfig = latestConfig();
          const groupPropertyId =
            type === "calendar"
              ? undefined
              : (getGroupPropertyId(currentConfig) ??
                getTimelineGroupPropertyId(viewProperties ?? properties) ??
                undefined);
          changeType(
            getMergedDatabaseConfig(currentConfig, {
              datePropertyId,
              ...(groupPropertyId ? { groupPropertyId } : {}),
            }),
            currentConfig,
          );
        });
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
      const nextConfig = getConvertedViewConfig({
        currentConfig,
        type,
        previousType: activeView.type,
        kanbanGroupProperty,
        properties,
      });

      observeOperation(updateDatabaseView, {
        configuration: diffConfiguration(currentConfig, nextConfig),
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
        type,
      });
    },
    updateDatabaseChartSettings,
    updateDatabaseLayoutSettings,
    updateDatabaseFormHeaderSettings: (settings: Partial<DatabaseFormHeaderSettings>) => {
      if (!editable || !databaseId || !activeView?.id || activeView.type !== "form") {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        formHeader: {
          ...getDatabaseFormHeaderSettings(currentConfig),
          ...settings,
        },
      });

      observeOperation(updateDatabaseView, {
        configuration: diffConfiguration(currentConfig, nextConfig),
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    updateDatabaseFormQuestionSettings: (
      propertyId: string,
      settings: DatabaseFormQuestionSettingsPatch,
    ) => {
      if (!editable || !databaseId || !activeView?.id || activeView.type !== "form") {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
      const currentQuestions = getDatabaseFormQuestionSettingsById(currentConfig);
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        formQuestions: {
          ...currentQuestions,
          [propertyId]: {
            ...currentQuestions[propertyId],
            ...settings,
          },
        },
      });

      observeOperation(updateDatabaseView, {
        configuration: diffConfiguration(currentConfig, nextConfig),
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    updateDatabaseFormShareSettings: (settings: Partial<DatabaseFormShareSettings>) => {
      if (!databaseId || !activeView?.id || activeView.type !== "form") {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        formShare: {
          ...getDatabaseFormShareSettings(currentConfig),
          ...settings,
        },
      });

      observeOperation(updateDatabaseView, {
        configuration: diffConfiguration(currentConfig, nextConfig),
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    updateDatabaseSubItemsSettings: (settings: Partial<DatabaseSubItemsSettings>) => {
      if (!databaseId || !activeView?.id) {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        subItems: {
          ...getDatabaseSubItemsSettings(currentConfig),
          ...settings,
        },
      });

      observeOperation(updateDatabaseView, {
        configuration: diffConfiguration(currentConfig, nextConfig),
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    updateNameColumnConfig: (config: DatabaseNameColumnConfig) => {
      if (!editable || !databaseId) {
        return;
      }

      observeOperation(updateDatabase, {
        configuration: diffConfiguration(
          databaseConfig,
          getMergedNameColumnConfig(databaseConfig, config),
        ),
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

      if (areSerializedPropertyValuesEqual(propertyType, currentValue, nextValue)) {
        return;
      }

      observeOperation(updateValue, {
        databaseId,
        ...(viewDatabaseId ? { hostDatabaseId: viewDatabaseId } : {}),
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
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
      const hiddenPropertyIds = new Set(
        hasViewHiddenPropertyIds(currentConfig)
          ? getViewHiddenPropertyIds(currentConfig)
          : activeView.type === "calendar"
            ? properties.map((property) => property.id)
            : isKanbanView
              ? getDefaultKanbanHiddenPropertyIds(
                  properties,
                  getGroupPropertyId(currentConfig) ?? kanbanGroupProperty?.property.id ?? null,
                )
              : properties
                  .filter((property) => getPropertyHidden(property.property.config))
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

      observeOperation(updateDatabaseView, {
        configuration: diffConfiguration(currentConfig, nextConfig),
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    togglePropertyTitles: () => {
      if (!databaseId || !activeView?.id) {
        return;
      }

      const currentConfig =
        getLatestViewConfig?.(databaseId, activeView.id, activeView.config) ?? activeView.config;
      const nextConfig = getMergedDatabaseConfig(currentConfig, {
        showPropertyTitles: !getShowPropertyTitles(currentConfig),
      });

      observeOperation(updateDatabaseView, {
        configuration: diffConfiguration(currentConfig, nextConfig),
        databaseId: viewDatabaseId ?? databaseId,
        databaseViewId: activeView.id,
      });
    },
    updateDatabasePropertyConfig: (databasePropertyId: string, config: unknown) => {
      if (!databaseId) {
        return Promise.resolve();
      }
      const currentPropertyConfig = viewProperties?.find(
        (property) => property.id === databasePropertyId,
      )?.property.config;
      const nextConfig = getMergedPropertyConfig(
        currentPropertyConfig,
        config as DatabasePropertyConfig,
      );

      const trimUpdates = getRelationLimitTrimUpdates({
        databasePropertyId,
        payload: relationPayloadFromViewData(viewData),
        propertyConfig: nextConfig,
      });

      for (const update of trimUpdates) {
        observeOperation(updateValue, {
          databaseId,
          ...(viewDatabaseId ? { hostDatabaseId: viewDatabaseId } : {}),
          propertyId: update.propertyId,
          rowId: update.rowId,
          value: update.value,
        });
      }

      return updateProperty({
        configuration: diffConfiguration(currentPropertyConfig, nextConfig),
        databaseId,
        databasePropertyId,
      });
    },
    updateDatabaseSort: (index: number, patch: Partial<DatabaseSortConfig>) => {
      saveDatabaseSorts(
        latestSorts().map(({ column, direction }) =>
          column === activeDatabaseSorts[index]?.column
            ? { column, direction, ...patch }
            : { column, direction },
        ),
      );
    },
    updateDatabaseFilter: (index: number, patch: DatabaseFilterUpdatePatch) => {
      saveDatabaseFilters(
        getPlainDatabaseFilters().map((filter) => {
          if (filter.id !== activeDatabaseFilters[index]?.id) {
            return filter;
          }

          if (patch.propertyId && patch.propertyId !== filter.propertyId) {
            const propertyType = getFilterPropertyType(patch.propertyId);
            const operator = getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is";

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

function createTimelineDateResolver({
  pending = {},
  addProperty,
  databaseId,
  editable,
  viewData,
  properties,
  timelineDateProperty,
  config,
  isCurrent,
  notify,
}: {
  pending?: Partial<Record<keyof DatabaseMutations, boolean>>;
  addProperty: DatabaseMutations["addProperty"];
  databaseId: string | null | undefined;
  editable: boolean;
  viewData: DatabaseViewData | null | undefined;
  properties: DatabasePropertyEntity[];
  timelineDateProperty: DatabasePropertyListItem | null;
  config?: unknown;
  isCurrent: () => boolean;
  notify: { error: (message: string) => void };
}) {
  let resolving = false;
  return (onResolved: (datePropertyId: string) => void, optimistic = false) => {
    const viewProperties = viewData
      ? viewData.bootstrap.properties.filter(
          (property) => property.dataSourceId === viewData.dataSourceId,
        )
      : null;
    const currentProperties = viewProperties ?? properties;
    const existingDateProperty =
      (timelineDateProperty?.property.type === "date" ? timelineDateProperty : null) ??
      getTimelineDateProperty(currentProperties, config);

    if (existingDateProperty) {
      onResolved(existingDateProperty.property.id);
      return;
    }

    if (!editable || !databaseId || pending.addProperty || resolving) {
      return;
    }

    resolving = true;
    let resolved = false;
    const resolve = (created: DatabasePropertyEntity) => {
      if (resolved || !isCurrent()) return;
      resolved = true;
      onResolved(created.property.id);
    };
    observeOperation(
      addProperty,
      {
        databaseId,
        name: "Date",
        type: "date",
        ...(optimistic ? { onOptimistic: resolve } : {}),
      },
      {
        onSuccess: (createdDateProperty) => {
          resolving = false;
          resolve(createdDateProperty);
        },
        onError: () => {
          resolving = false;
          if (isCurrent()) notify.error("Couldn't add date property");
        },
      },
    );
  };
}

function createDatabaseFilterId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `filter-${crypto.randomUUID()}`;
  }

  return `filter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
