import { rejectPlan, type PlanAdmission, type PlanResults } from "../../actions/plan";
import type { DatabasePropertyEntity } from "../core/entities";
import { diffConfiguration } from "../interactions/configuration";
import { hasViewHiddenPropertyIds } from "../interactions/item-utils";
import type { DatabasePropertyFilterConfig } from "../schema/filter";
import {
  getDatabaseFilterOperatorsForType,
  getValidDatabaseFilterOperator,
  isDatabaseFilterGroup,
} from "../schema/filter";
import { getDefaultDatabasePropertyConfig } from "../schema/property-defaults";
import type { DatabaseCalendarMode } from "../views/calendar";
import type { DatabaseChartSettings } from "../views/chart-config";
import { defaultDatabaseChartSettings, getDatabaseChartSettings } from "../views/chart-config";
import type {
  DatabaseConditionalColorConfig,
  DatabaseLayoutSettings,
  DatabaseSortConfig,
  DatabaseSubItemsSettings,
} from "../views/configuration";
import {
  getDatabaseFilters,
  getDatabaseLayoutSettings,
  getDatabaseSorts,
  getDatabaseSubItemsSettings,
  getMergedDatabaseConfig,
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
import { getGroupPropertyId, getKanbanGroupProperty } from "../views/grouping";
import { getDefaultKanbanHiddenPropertyIds } from "../views/kanban-group-settings";
import { getTimelineDateProperty } from "../views/timeline-date";
import { getConvertedViewConfig, removeDatabaseGroupProperty } from "../views/type-transition";
import { getTimelineGroupPropertyId } from "../records/row-plans";
import {
  currentViewConfig,
  sourceProperties,
  viewHostId,
  type DatabaseIntentState,
  type DatabasePlan,
  type DatabaseStep,
  type Prerequisite,
} from "./state";

export type DatabaseViewType =
  | "table"
  | "kanban"
  | "timeline"
  | "calendar"
  | "chart"
  | "gallery"
  | "list"
  | "form";

export const KANBAN_GROUP_PROPERTY_KEY = "kanban-group-property";
export const TIMELINE_DATE_PROPERTY_KEY = "timeline-date-property";

// Prerequisites

type GroupProperty = { property: DatabasePropertyEntity; properties: DatabasePropertyEntity[] };

/** Reuses the Kanban grouping property or creates a default Status property. */
export function kanbanGroupPropertyPrerequisite(
  state: DatabaseIntentState,
  admit: PlanAdmission = "ack",
): Prerequisite<GroupProperty> | null {
  const properties = sourceProperties(state);
  const existing = getKanbanGroupProperty(
    properties,
    state.activeView?.type === "kanban" ? currentViewConfig(state) : null,
  );
  if (existing) return { steps: [], resolve: () => ({ property: existing, properties }) };
  if (!state.editable || !state.dataSourceId) return null;
  return {
    steps: [
      {
        id: "groupProperty",
        op: "addProperty",
        input: () => ({
          databaseId: state.dataSourceId!,
          name: "Status",
          type: "status",
          config: getDefaultDatabasePropertyConfig("status"),
        }),
        admit,
        failure: "Couldn't add status property",
        key: KANBAN_GROUP_PROPERTY_KEY,
      },
    ],
    resolve: (done) => {
      const created = done.get<DatabasePropertyEntity>("groupProperty");
      return { property: created, properties: [...properties, created] };
    },
  };
}

/** Reuses the timeline/calendar date property or creates a default Date property. */
export function timelineDatePropertyPrerequisite(
  state: DatabaseIntentState,
  admit: PlanAdmission = "ack",
): Prerequisite<string> | null {
  const timeline = state.timelineDateProperty;
  const existing =
    (timeline?.property.type === "date" ? timeline : null) ??
    getTimelineDateProperty(sourceProperties(state), state.activeView?.config);
  if (existing) return { steps: [], resolve: () => existing.property.id };
  if (!state.editable || !state.dataSourceId) return null;
  return {
    steps: [
      {
        id: "dateProperty",
        op: "addProperty",
        input: () => ({ databaseId: state.dataSourceId!, name: "Date", type: "date" }),
        admit,
        failure: "Couldn't add date property",
        key: TIMELINE_DATE_PROPERTY_KEY,
      },
    ],
    resolve: (done) => done.get<DatabasePropertyEntity>("dateProperty").property.id,
  };
}

// Helpers

function viewUpdate(
  state: DatabaseIntentState,
  configuration: (done: PlanResults) => {
    configuration: ReturnType<typeof diffConfiguration>;
    type?: string;
  },
  failure?: string,
): DatabaseStep {
  return {
    op: "updateDatabaseView",
    input: (done) => ({
      ...configuration(done),
      databaseId: viewHostId(state),
      databaseViewId: state.activeView!.id,
    }),
    ...(failure ? { failure } : {}),
  };
}

function hasActiveView(state: DatabaseIntentState) {
  return Boolean(state.dataSourceId && state.activeView?.id);
}

function mergeViewConfig(
  state: DatabaseIntentState,
  next: (current: unknown) => unknown,
  base: () => unknown = () => currentViewConfig(state),
): DatabasePlan {
  if (!hasActiveView(state)) return rejectPlan("no_active_view");
  return {
    steps: [
      viewUpdate(state, () => {
        const current = base();
        return { configuration: diffConfiguration(current, next(current)) };
      }),
    ],
  };
}

function filterPropertyType(state: DatabaseIntentState, propertyId: string) {
  if (propertyId === "name") return "text";
  return state.properties.find((property) => property.id === propertyId)?.property.type ?? "text";
}

export function createDatabaseFilterId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `filter-${crypto.randomUUID()}`;
  }
  return `filter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function newDatabaseFilter(
  state: DatabaseIntentState,
  propertyId: DatabasePropertyFilterConfig["propertyId"],
  id = createDatabaseFilterId(),
): DatabasePropertyFilterConfig {
  return {
    id,
    operator:
      getDatabaseFilterOperatorsForType(filterPropertyType(state, propertyId))[0]?.value ?? "is",
    propertyId,
    values: [],
  };
}

export function latestDatabaseSorts(state: DatabaseIntentState) {
  return state.latestViewConfig
    ? getDatabaseSorts(currentViewConfig(state))
    : state.activeDatabaseSorts;
}

export function plainDatabaseFilters(state: DatabaseIntentState) {
  return (
    state.latestViewConfig
      ? getDatabaseFilters(currentViewConfig(state)).filter(
          (filter): filter is DatabasePropertyFilterConfig => !isDatabaseFilterGroup(filter),
        )
      : state.activeDatabaseFilters
  ).map(({ id, operator, propertyId, values }) => ({
    id,
    operator: getValidDatabaseFilterOperator(operator, filterPropertyType(state, propertyId)),
    propertyId,
    values,
  }));
}

// View creation

function viewCreation(
  state: DatabaseIntentState,
  view: { config?: unknown; name: string; type: DatabaseViewType },
  failure: string,
  prerequisite: DatabaseStep[] = [],
  config?: (done: PlanResults) => unknown,
): DatabasePlan {
  return {
    select: "view",
    steps: [
      ...prerequisite,
      {
        id: "view",
        op: "addDatabaseView",
        input: (done) => ({
          ...(config
            ? { config: config(done) }
            : view.config === undefined
              ? {}
              : { config: view.config }),
          databaseId: viewHostId(state),
          dataSourceId: state.dataSourceId!,
          name: view.name,
          type: view.type,
        }),
        admit: "optimistic",
        failure,
      },
    ],
  };
}

function canCreateView(state: DatabaseIntentState) {
  return state.editable && Boolean(state.dataSourceId);
}

export function planAddTableView(state: DatabaseIntentState): DatabasePlan {
  if (!canCreateView(state)) return rejectPlan("not_editable");
  return viewCreation(state, { name: "Table", type: "table" }, "Couldn't add table view");
}

export function planAddListView(state: DatabaseIntentState): DatabasePlan {
  if (!canCreateView(state)) return rejectPlan("not_editable");
  return viewCreation(state, { name: "List", type: "list" }, "Couldn't add list view");
}

export function planAddGalleryView(state: DatabaseIntentState): DatabasePlan {
  if (!canCreateView(state)) return rejectPlan("not_editable");
  return viewCreation(state, { name: "Gallery", type: "gallery" }, "Couldn't add gallery view");
}

export function planAddChartView(state: DatabaseIntentState): DatabasePlan {
  if (!canCreateView(state)) return rejectPlan("not_editable");
  return viewCreation(
    state,
    {
      config: { chart: { ...defaultDatabaseChartSettings, valueColors: {} } },
      name: "Chart",
      type: "chart",
    },
    "Couldn't add chart view",
  );
}

export function planAddFormView(state: DatabaseIntentState, hiddenPropertyIds: string[]) {
  if (!canCreateView(state)) return rejectPlan("not_editable");
  return viewCreation(
    state,
    { config: { hiddenPropertyIds }, name: "Form", type: "form" },
    "Couldn't add form view",
  );
}

export function planAddKanbanView(state: DatabaseIntentState): DatabasePlan {
  if (!canCreateView(state)) return rejectPlan("not_editable");
  const group = kanbanGroupPropertyPrerequisite(state, "optimistic");
  if (!group) return rejectPlan("not_editable");
  return viewCreation(
    state,
    { name: "Kanban", type: "kanban" },
    "Couldn't add kanban view",
    group.steps,
    (done) => {
      const { property, properties } = group.resolve(done);
      const groupPropertyId = property.property.id;
      return {
        groupPropertyId,
        hiddenPropertyIds: getDefaultKanbanHiddenPropertyIds(properties, groupPropertyId),
      };
    },
  );
}

export function planAddTimelineView(state: DatabaseIntentState): DatabasePlan {
  if (!canCreateView(state)) return rejectPlan("not_editable");
  const date = timelineDatePropertyPrerequisite(state, "optimistic");
  if (!date) return rejectPlan("not_editable");
  return viewCreation(
    state,
    { name: "Timeline", type: "timeline" },
    "Couldn't add timeline view",
    date.steps,
    (done) => {
      const groupPropertyId = getTimelineGroupPropertyId(sourceProperties(state));
      return {
        datePropertyId: date.resolve(done),
        ...(groupPropertyId ? { groupPropertyId } : {}),
      };
    },
  );
}

export function planAddCalendarView(state: DatabaseIntentState): DatabasePlan {
  if (!canCreateView(state)) return rejectPlan("not_editable");
  const date = timelineDatePropertyPrerequisite(state, "optimistic");
  if (!date) return rejectPlan("not_editable");
  return viewCreation(
    state,
    { name: "Calendar", type: "calendar" },
    "Couldn't add calendar view",
    date.steps,
    (done) => ({ datePropertyId: date.resolve(done), calendarView: "month" }),
  );
}

// Layout, grouping and dates

export function planSetViewType(state: DatabaseIntentState, type: DatabaseViewType): DatabasePlan {
  const { activeView } = state;
  if (!state.editable || !state.dataSourceId || !activeView?.id) return rejectPlan("not_editable");
  if (type === activeView.type) return rejectPlan("unchanged");
  const failure = "Couldn't change view layout";
  if (type === "kanban") {
    const group = kanbanGroupPropertyPrerequisite(state);
    if (!group) return rejectPlan("not_editable");
    return {
      steps: [
        ...group.steps,
        viewUpdate(
          state,
          (done) => {
            const { property, properties } = group.resolve(done);
            const current = currentViewConfig(state);
            return {
              configuration: diffConfiguration(
                current,
                getConvertedViewConfig({
                  currentConfig: current,
                  type,
                  previousType: activeView.type,
                  kanbanGroupProperty: property,
                  properties,
                }),
              ),
              type,
            };
          },
          failure,
        ),
      ],
    };
  }
  if (type === "timeline" || type === "calendar") {
    const date = timelineDatePropertyPrerequisite(state);
    if (!date) return rejectPlan("not_editable");
    return {
      steps: [
        ...date.steps,
        viewUpdate(
          state,
          (done) => {
            const current = currentViewConfig(state);
            const groupPropertyId =
              type === "calendar"
                ? undefined
                : (getGroupPropertyId(current) ??
                  getTimelineGroupPropertyId(sourceProperties(state)) ??
                  undefined);
            return {
              configuration: diffConfiguration(
                current,
                getMergedDatabaseConfig(current, {
                  datePropertyId: date.resolve(done),
                  ...(groupPropertyId ? { groupPropertyId } : {}),
                }),
              ),
              type,
            };
          },
          failure,
        ),
      ],
    };
  }
  return {
    steps: [
      viewUpdate(state, () => {
        const current = currentViewConfig(state);
        return {
          configuration: diffConfiguration(
            current,
            getConvertedViewConfig({
              currentConfig: current,
              type,
              previousType: activeView.type,
              kanbanGroupProperty: state.kanbanGroupProperty,
              properties: state.properties,
            }),
          ),
          type,
        };
      }),
    ],
  };
}

export function planSetViewGroupProperty(
  state: DatabaseIntentState,
  groupPropertyId: string | null,
): DatabasePlan {
  return mergeViewConfig(state, (current) => {
    let next = getMergedDatabaseConfig(current, { groupPropertyId: groupPropertyId ?? undefined });
    if (groupPropertyId === null) next = removeDatabaseGroupProperty(next);
    if (!state.isKanbanView) return next;
    const currentGroupPropertyId =
      getGroupPropertyId(current) ?? state.kanbanGroupProperty?.property.id ?? null;
    const hidden = new Set(
      hasViewHiddenPropertyIds(current)
        ? getViewHiddenPropertyIds(current)
        : getDefaultKanbanHiddenPropertyIds(state.properties, currentGroupPropertyId),
    );
    const previous = state.properties.find(
      (property) => property.property.id === currentGroupPropertyId,
    );
    const nextGroup = state.properties.find((property) => property.property.id === groupPropertyId);
    if (previous) hidden.delete(previous.id);
    if (nextGroup) hidden.add(nextGroup.id);
    return getMergedDatabaseConfig(next, { hiddenPropertyIds: [...hidden] });
  });
}

/** Uses the stored view configuration, matching the date picker's behavior. */
export function planSetViewDateProperty(
  state: DatabaseIntentState,
  datePropertyId: string | null,
): DatabasePlan {
  return mergeViewConfig(
    state,
    (current) => getMergedDatabaseConfig(current, { datePropertyId: datePropertyId ?? undefined }),
    () => state.activeView?.config,
  );
}

function datePropertyUpdate(
  state: DatabaseIntentState,
  datePropertyId: (done: PlanResults) => string,
) {
  return viewUpdate(state, (done) => {
    const current = state.activeView!.config;
    return {
      configuration: diffConfiguration(
        current,
        getMergedDatabaseConfig(current, { datePropertyId: datePropertyId(done) }),
      ),
    };
  });
}

export function planSetupTimelineDateProperty(state: DatabaseIntentState): DatabasePlan {
  if (!hasActiveView(state)) return rejectPlan("no_active_view");
  const date = timelineDatePropertyPrerequisite(state);
  if (!date) return rejectPlan("not_editable");
  return { steps: [...date.steps, datePropertyUpdate(state, (done) => date.resolve(done))] };
}

export function planSetupRequiredViewProperties(state: DatabaseIntentState): DatabasePlan {
  const { activeView } = state;
  if (!state.editable || !state.dataSourceId || !activeView) return rejectPlan("not_editable");
  if (activeView.type === "kanban") {
    const group = kanbanGroupPropertyPrerequisite(state);
    if (!group) return rejectPlan("not_editable");
    return {
      steps: [
        ...group.steps,
        viewUpdate(
          state,
          (done) => {
            const { property, properties } = group.resolve(done);
            const current = currentViewConfig(state);
            return {
              configuration: diffConfiguration(
                current,
                getConvertedViewConfig({
                  currentConfig: current,
                  type: "kanban",
                  previousType: "kanban",
                  kanbanGroupProperty: property,
                  properties,
                }),
              ),
            };
          },
          "Couldn't configure view grouping",
        ),
      ],
    };
  }
  if (activeView.type === "timeline" || activeView.type === "calendar")
    return planSetupTimelineDateProperty(state);
  return rejectPlan("nothing_required");
}

export function planSetCalendarMode(
  state: DatabaseIntentState,
  calendarView: DatabaseCalendarMode,
): DatabasePlan {
  if (!state.editable || !state.dataSourceId || !state.activeView)
    return rejectPlan("not_editable");
  return mergeViewConfig(state, (current) => getMergedDatabaseConfig(current, { calendarView }));
}

// Sorts and filters

export function planSaveDatabaseSorts(
  state: DatabaseIntentState,
  sorts: DatabaseSortConfig[],
): DatabasePlan {
  return mergeViewConfig(state, (current) =>
    getMergedDatabaseConfig(current, { sorts: sorts.length > 0 ? sorts : undefined }),
  );
}

export function sortsWithAdded(state: DatabaseIntentState, field: string): DatabaseSortConfig[] {
  return [
    ...latestDatabaseSorts(state).map(({ column, direction }) => ({ column, direction })),
    { column: field, direction: "ascending" },
  ];
}

export function sortsWithUpdated(
  state: DatabaseIntentState,
  column: string | undefined,
  patch: Partial<DatabaseSortConfig>,
): DatabaseSortConfig[] {
  return latestDatabaseSorts(state).map((sort) =>
    sort.column === column
      ? { column: sort.column, direction: sort.direction, ...patch }
      : { column: sort.column, direction: sort.direction },
  );
}

export function sortsWithRemoved(
  state: DatabaseIntentState,
  column: string | undefined,
): DatabaseSortConfig[] {
  return latestDatabaseSorts(state).flatMap(({ column: current, direction }) =>
    current === column ? [] : [{ column: current, direction }],
  );
}

export function planSaveDatabaseFilters(
  state: DatabaseIntentState,
  filters: DatabasePropertyFilterConfig[],
): DatabasePlan {
  return mergeViewConfig(state, (current) =>
    getMergedDatabaseConfig(current, { filters: filters.length > 0 ? filters : undefined }),
  );
}

export function planCreateDatabaseFilter(
  state: DatabaseIntentState,
  field: string,
  filterId?: string,
): DatabasePlan {
  const filters = plainDatabaseFilters(state);
  if (filters.some((filter) => filter.propertyId === field)) return rejectPlan("duplicate_filter");
  return planSaveDatabaseFilters(state, [...filters, newDatabaseFilter(state, field, filterId)]);
}

export function planUpdateDatabaseFilter(
  state: DatabaseIntentState,
  filterId: string | undefined,
  patch: DatabaseFilterUpdatePatch,
) {
  return planSaveDatabaseFilters(
    state,
    plainDatabaseFilters(state).map((filter) => {
      if (filter.id !== filterId) return filter;
      if (patch.propertyId && patch.propertyId !== filter.propertyId) {
        const operator =
          getDatabaseFilterOperatorsForType(filterPropertyType(state, patch.propertyId))[0]
            ?.value ?? "is";
        return { ...filter, operator, propertyId: patch.propertyId, values: patch.values ?? [] };
      }
      const operator = patch.operator
        ? getValidDatabaseFilterOperator(
            patch.operator,
            filterPropertyType(state, filter.propertyId),
          )
        : filter.operator;
      return { ...filter, operator, values: patch.values ?? filter.values };
    }),
  );
}

export function planRemoveDatabaseFilter(state: DatabaseIntentState, filterId: string | undefined) {
  return planSaveDatabaseFilters(
    state,
    plainDatabaseFilters(state).filter((filter) => filter.id !== filterId),
  );
}

export function planReorderDatabaseFilters(state: DatabaseIntentState, filterIds: string[]) {
  const filters = plainDatabaseFilters(state);
  const byId = new Map(filters.map((filter) => [filter.id, filter]));
  const reordered = filterIds.flatMap((id) => {
    const filter = byId.get(id);
    return filter ? [filter] : [];
  });
  return planSaveDatabaseFilters(state, [
    ...reordered,
    ...filters.filter((filter) => !filterIds.includes(filter.id)),
  ]);
}

/** Uses the stored view configuration, matching the conditional color editor. */
export function planSaveDatabaseConditionalColors(
  state: DatabaseIntentState,
  colors: DatabaseConditionalColorConfig[],
): DatabasePlan {
  return mergeViewConfig(
    state,
    (current) =>
      getMergedDatabaseConfig(current, {
        conditionalColors: colors.length > 0 ? colors : undefined,
      }),
    () => state.activeView?.config,
  );
}

// Presentation

export function planSaveDatabasePropertyOrder(
  state: DatabaseIntentState,
  propertyIds: string[],
): DatabasePlan {
  if (!state.editable || !hasActiveView(state)) return rejectPlan("not_editable");
  const valid = new Set(["name", ...state.properties.map((property) => property.id)]);
  const seen = new Set<string>();
  const ordered = propertyIds.filter((id) => {
    if (!valid.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const propertyOrder = [
    ...ordered,
    ...state.properties.map((property) => property.id).filter((id) => !seen.has(id)),
  ];
  return mergeViewConfig(state, (current) => getMergedDatabaseConfig(current, { propertyOrder }));
}

export function planTogglePropertyVisibility(
  state: DatabaseIntentState,
  propertyId: string,
): DatabasePlan {
  return mergeViewConfig(state, (current) => {
    const hidden = new Set(
      hasViewHiddenPropertyIds(current)
        ? getViewHiddenPropertyIds(current)
        : state.activeView?.type === "calendar"
          ? state.properties.map((property) => property.id)
          : state.isKanbanView
            ? getDefaultKanbanHiddenPropertyIds(
                state.properties,
                getGroupPropertyId(current) ?? state.kanbanGroupProperty?.property.id ?? null,
              )
            : state.properties
                .filter((property) => getPropertyHidden(property.property.config))
                .map((property) => property.id),
    );
    if (hidden.has(propertyId)) hidden.delete(propertyId);
    else hidden.add(propertyId);
    return getMergedDatabaseConfig(current, { hiddenPropertyIds: [...hidden] });
  });
}

export function planTogglePropertyTitles(state: DatabaseIntentState): DatabasePlan {
  return mergeViewConfig(state, (current) =>
    getMergedDatabaseConfig(current, { showPropertyTitles: !getShowPropertyTitles(current) }),
  );
}

export function planUpdateChartSettings(
  state: DatabaseIntentState,
  settings: Partial<DatabaseChartSettings>,
): DatabasePlan {
  return mergeViewConfig(state, (current) =>
    getMergedDatabaseConfig(current, {
      chart: { ...getDatabaseChartSettings(current), ...settings },
    }),
  );
}

export function planUpdateLayoutSettings(
  state: DatabaseIntentState,
  settings: Partial<DatabaseLayoutSettings>,
): DatabasePlan {
  return mergeViewConfig(state, (current) =>
    getMergedDatabaseConfig(current, {
      layout: { ...getDatabaseLayoutSettings(current), ...settings },
    }),
  );
}

export function planUpdateSubItemsSettings(
  state: DatabaseIntentState,
  settings: Partial<DatabaseSubItemsSettings>,
): DatabasePlan {
  return mergeViewConfig(state, (current) =>
    getMergedDatabaseConfig(current, {
      subItems: { ...getDatabaseSubItemsSettings(current), ...settings },
    }),
  );
}

function isFormView(state: DatabaseIntentState) {
  return state.activeView?.type === "form";
}

export function planUpdateFormHeaderSettings(
  state: DatabaseIntentState,
  settings: Partial<DatabaseFormHeaderSettings>,
): DatabasePlan {
  if (!state.editable || !isFormView(state)) return rejectPlan("not_form_view");
  return mergeViewConfig(state, (current) =>
    getMergedDatabaseConfig(current, {
      formHeader: { ...getDatabaseFormHeaderSettings(current), ...settings },
    }),
  );
}

export function planUpdateFormQuestionSettings(
  state: DatabaseIntentState,
  propertyId: string,
  settings: DatabaseFormQuestionSettingsPatch,
): DatabasePlan {
  if (!state.editable || !isFormView(state)) return rejectPlan("not_form_view");
  return mergeViewConfig(state, (current) => {
    const questions = getDatabaseFormQuestionSettingsById(current);
    return getMergedDatabaseConfig(current, {
      formQuestions: { ...questions, [propertyId]: { ...questions[propertyId], ...settings } },
    });
  });
}

export function planUpdateFormShareSettings(
  state: DatabaseIntentState,
  settings: Partial<DatabaseFormShareSettings>,
): DatabasePlan {
  if (!isFormView(state)) return rejectPlan("not_form_view");
  return mergeViewConfig(state, (current) =>
    getMergedDatabaseConfig(current, {
      formShare: { ...getDatabaseFormShareSettings(current), ...settings },
    }),
  );
}

export function planRenameView(state: DatabaseIntentState, name: string): DatabasePlan {
  if (!hasActiveView(state)) return rejectPlan("no_active_view");
  if (name === state.activeView!.name) return rejectPlan("unchanged");
  return {
    steps: [
      {
        op: "updateDatabaseView",
        input: () => ({
          databaseId: viewHostId(state),
          databaseViewId: state.activeView!.id,
          name,
        }),
      },
    ],
  };
}
