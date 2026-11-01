import { isPlanRejection, runPlan } from "../../actions/plan";
import type { DatabasePropertyEntity, DatabaseViewEntity } from "../core/entities";
import type { DatabaseRow } from "../core/export-payload";
import type { DatabasePropertyFilterConfig } from "../schema/filter";
import type { DatabasePropertyValue } from "../schema/property-values";
import type { DatabaseCalendarMode, DatabaseCalendarSchedule } from "../views/calendar";
import type { DatabaseChartSettings } from "../views/chart-config";
import type {
  DatabaseConditionalColorConfig,
  DatabaseLayoutSettings,
  DatabaseNameColumnConfig,
  DatabaseSortConfig,
  DatabaseSubItemsSettings,
} from "../views/configuration";
import type { DatabaseFilterUpdatePatch } from "../views/contracts";
import type {
  DatabaseFormHeaderSettings,
  DatabaseFormQuestionSettingsPatch,
  DatabaseFormShareSettings,
} from "../views/form";
import type { DatabasePropertyListItem } from "../views/grouping";
import type { DatabaseViewData } from "../views/source-state";
import type { DatabaseIntentState, DatabasePlan } from "../planners/state";
import {
  planAddCalendarRow,
  planAddDatabaseRow,
  planAddProperty,
  planAddTimelineRow,
  planRenameProperty,
  planSaveDatabaseEmoji,
  planSaveDatabaseTitle,
  planSavePropertyValue,
  planUpdateNameColumn,
  planUpdatePropertyConfig,
} from "../planners/records";
import {
  planAddCalendarView,
  planAddChartView,
  planAddFormView,
  planAddGalleryView,
  planAddKanbanView,
  planAddListView,
  planAddTableView,
  planAddTimelineView,
  planCreateDatabaseFilter,
  planRemoveDatabaseFilter,
  planRenameView,
  planReorderDatabaseFilters,
  planSaveDatabaseConditionalColors,
  planSaveDatabaseFilters,
  planSaveDatabasePropertyOrder,
  planSaveDatabaseSorts,
  planSetCalendarMode,
  planSetupRequiredViewProperties,
  planSetupTimelineDateProperty,
  planSetViewDateProperty,
  planSetViewGroupProperty,
  planSetViewType,
  planTogglePropertyTitles,
  planTogglePropertyVisibility,
  planUpdateChartSettings,
  planUpdateDatabaseFilter,
  planUpdateFormHeaderSettings,
  planUpdateFormQuestionSettings,
  planUpdateFormShareSettings,
  planUpdateLayoutSettings,
  planUpdateSubItemsSettings,
  sortsWithAdded,
  sortsWithRemoved,
  sortsWithUpdated,
  type DatabaseViewType,
} from "../planners/views";
import type { DatabaseMutations } from "./mutation-bindings";
import { observeOperation } from "./mutation-bindings";
import type { DatabasePageDragPayload } from "./page-drop";
import { getDraggedRowGroupSetup } from "./row-plans";

export type DatabaseViewCommands = ReturnType<typeof createDatabaseViewCommands>;

type PendingOperations = Partial<Record<keyof DatabaseMutations, boolean>>;

/**
 * Binds database planners to the client's mutations. Planners own the
 * decisions shared with server executors; this module keeps UI guards,
 * optimistic admission, selection and notifications.
 */
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
  pending?: PendingOperations;
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
  const { addRow, changeRow } = mutations;
  const state: DatabaseIntentState = {
    dataSourceId: databaseId,
    hostDatabaseId: viewDatabaseId,
    editable,
    activeView,
    activeDatabaseFilters,
    activeDatabaseSorts,
    properties,
    items,
    isKanbanView,
    kanbanGroupProperty,
    timelineDateProperty,
    viewData,
    ...(getLatestViewConfig && activeView && databaseId
      ? {
          latestViewConfig: () =>
            getLatestViewConfig(viewDatabaseId ?? databaseId, activeView.id, activeView.config),
        }
      : {}),
  };
  const databasePageId = viewData?.bootstrap.database.pageId;
  // Prerequisite properties are created once even if an intent repeats quickly.
  const runningKeys = new Set<string>();

  const run = (outcome: DatabasePlan, busy?: (keyof DatabaseMutations)[]) => {
    if (isPlanRejection(outcome)) {
      if (outcome.message) notify.error(outcome.message);
      return null;
    }
    if (busy?.some((operation) => pending[operation])) return null;
    const keys = outcome.steps.flatMap((step) => (step.key ? [step.key] : []));
    if (keys.length && (pending.addProperty || keys.some((key) => runningKeys.has(key))))
      return null;
    return runPlan(outcome, mutations, {
      isCurrent,
      onFailure: (message) => notify.error(message),
      onSelect: (view) => onViewCreated((view as DatabaseViewEntity).id),
      onStepStart: ({ key }) => key && runningKeys.add(key),
      onStepSettled: ({ key }) => key && runningKeys.delete(key),
    });
  };
  /** Settles like the final operation: resolves with its result or rejects with its error. */
  const settle = async (outcome: DatabasePlan) => {
    const result = await run(outcome);
    if (!result) return undefined;
    if (result.error !== undefined) throw result.error;
    return result.last;
  };
  const filterId = (index: number) => activeDatabaseFilters[index]?.id;
  const sortColumn = (index: number) => activeDatabaseSorts[index]?.column;
  const saveDatabaseSorts = (nextSorts: DatabaseSortConfig[]) => {
    const outcome = planSaveDatabaseSorts(state, nextSorts);
    if (isPlanRejection(outcome)) return Promise.resolve();
    onSortsChanged(nextSorts.length > 0);
    return settle(outcome);
  };
  const saveDatabaseFilters = (nextFilters: DatabasePropertyFilterConfig[]) => {
    run(planSaveDatabaseFilters(state, nextFilters));
  };

  return {
    addCalendarRow: async (schedule: DatabaseCalendarSchedule) => {
      const outcome = planAddCalendarRow(state, schedule);
      if (isPlanRejection(outcome)) throw new Error(outcome.message ?? outcome.rejected);
      const row = (await settle(outcome)) as { id: string; pageId: string };
      return { rowId: row.id, pageId: row.pageId };
    },
    addCalendarView: () => {
      run(planAddCalendarView(state), ["addDatabaseView", "addProperty"]);
    },
    setCalendarMode: (calendarView: DatabaseCalendarMode) => {
      run(planSetCalendarMode(state, calendarView));
    },
    addDatabaseProperty: (type = "text", label = "Property", position?: number) => {
      run(planAddProperty(state, type, label, position));
    },
    addDatabaseRow: (
      groupValue?: string,
      groupPropertyOverride?: DatabasePropertyListItem | null,
      parentRowId?: string | null,
    ) => {
      run(planAddDatabaseRow(state, groupValue, groupPropertyOverride, parentRowId));
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
      run(planAddChartView(state), ["addDatabaseView"]);
    },
    addGalleryView: () => {
      run(planAddGalleryView(state), ["addDatabaseView"]);
    },
    addFormView: (hiddenPropertyIds: string[]) => {
      run(planAddFormView(state, hiddenPropertyIds), ["addDatabaseView"]);
    },
    addKanbanView: () => {
      run(planAddKanbanView(state), ["addDatabaseView", "addProperty"]);
    },
    addListView: () => {
      run(planAddListView(state), ["addDatabaseView"]);
    },
    addTimelineRow: (
      startAt: Date,
      endAt: Date,
      groupValue?: string,
      groupProperty?: DatabasePropertyListItem | null,
    ) => {
      run(planAddTimelineRow(state, startAt, endAt, groupValue, groupProperty));
    },
    addTimelineView: () => {
      run(planAddTimelineView(state), ["addDatabaseView", "addProperty"]);
    },
    addTableView: () => {
      run(planAddTableView(state), ["addDatabaseView"]);
    },
    clearDatabaseSort: () => {
      void saveDatabaseSorts([]).catch(() => undefined);
    },
    clearDatabaseFilter: () => {
      saveDatabaseFilters([]);
    },
    setViewGroupProperty: (groupPropertyId: string | null) => {
      run(planSetViewGroupProperty(state, groupPropertyId));
    },
    setViewDateProperty: (datePropertyId: string | null) => {
      run(planSetViewDateProperty(state, datePropertyId));
    },
    setupRequiredViewProperties: () => {
      if (!isCurrent()) return;
      run(planSetupRequiredViewProperties(state), ["updateDatabaseView"]);
    },
    setupTimelineDateProperty: () => {
      run(planSetupTimelineDateProperty(state));
    },
    createDatabaseSort: (field: string) => {
      void saveDatabaseSorts(sortsWithAdded(state, field)).catch(() => undefined);
    },
    createDatabaseFilter: (field: string) => {
      run(planCreateDatabaseFilter(state, field));
    },
    removeDatabaseFilter: (index: number) => {
      run(planRemoveDatabaseFilter(state, filterId(index)));
    },
    reorderDatabaseFilters: (filterIds: string[]) => {
      run(planReorderDatabaseFilters(state, filterIds));
    },
    removeDatabaseSort: (index: number) => {
      void saveDatabaseSorts(sortsWithRemoved(state, sortColumn(index))).catch(() => undefined);
    },
    renameDatabaseProperty: (databasePropertyId: string, name: string) => {
      run(planRenameProperty(state, databasePropertyId, name));
    },
    saveDatabaseFilters,
    saveDatabaseConditionalColors: (nextConditionalColors: DatabaseConditionalColorConfig[]) => {
      run(planSaveDatabaseConditionalColors(state, nextConditionalColors));
    },
    saveDatabasePropertyOrder: (propertyIds: string[]) => {
      run(planSaveDatabasePropertyOrder(state, propertyIds));
    },
    saveDatabaseSorts,
    saveDatabaseEmoji: (nextEmoji: string) => {
      run(planSaveDatabaseEmoji(state, nextEmoji));
    },
    saveDatabaseTitle: (nextTitle: string) => {
      run(planSaveDatabaseTitle(state, nextTitle));
    },
    saveDatabaseViewTitle: (nextTitle: string) => {
      run(planRenameView(state, nextTitle));
    },
    setViewType: (type: DatabaseViewType) => {
      run(planSetViewType(state, type), ["updateDatabaseView"]);
    },
    updateDatabaseChartSettings: (settings: Partial<DatabaseChartSettings>) => {
      run(planUpdateChartSettings(state, settings));
    },
    updateDatabaseLayoutSettings: (settings: Partial<DatabaseLayoutSettings>) => {
      run(planUpdateLayoutSettings(state, settings));
    },
    updateDatabaseFormHeaderSettings: (settings: Partial<DatabaseFormHeaderSettings>) => {
      run(planUpdateFormHeaderSettings(state, settings));
    },
    updateDatabaseFormQuestionSettings: (
      propertyId: string,
      settings: DatabaseFormQuestionSettingsPatch,
    ) => {
      run(planUpdateFormQuestionSettings(state, propertyId, settings));
    },
    updateDatabaseFormShareSettings: (settings: Partial<DatabaseFormShareSettings>) => {
      run(planUpdateFormShareSettings(state, settings));
    },
    updateDatabaseSubItemsSettings: (settings: Partial<DatabaseSubItemsSettings>) => {
      run(planUpdateSubItemsSettings(state, settings));
    },
    updateNameColumnConfig: (config: DatabaseNameColumnConfig) => {
      run(planUpdateNameColumn(state, config));
    },
    savePropertyValue: (
      rowId: string,
      propertyId: string,
      propertyType: string,
      currentValue: DatabasePropertyValue,
      nextValue: DatabasePropertyValue,
    ) => {
      run(
        planSavePropertyValue(state, { rowId, propertyId, propertyType, currentValue, nextValue }),
      );
    },
    togglePropertyVisibility: (propertyId: string) => {
      run(planTogglePropertyVisibility(state, propertyId));
    },
    togglePropertyTitles: () => {
      run(planTogglePropertyTitles(state));
    },
    updateDatabasePropertyConfig: (databasePropertyId: string, config: unknown) => {
      const outcome = planUpdatePropertyConfig(state, databasePropertyId, config);
      return isPlanRejection(outcome) ? Promise.resolve() : settle(outcome);
    },
    updateDatabaseSort: (index: number, patch: Partial<DatabaseSortConfig>) => {
      void saveDatabaseSorts(sortsWithUpdated(state, sortColumn(index), patch)).catch(
        () => undefined,
      );
    },
    updateDatabaseFilter: (index: number, patch: DatabaseFilterUpdatePatch) => {
      run(planUpdateDatabaseFilter(state, filterId(index), patch));
    },
  };
}
