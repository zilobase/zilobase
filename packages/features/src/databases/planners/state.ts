import type { PlanOutcome, PlanResults, PlanStep } from "../../actions/plan";
import type { DatabasePropertyEntity, DatabaseViewEntity } from "../core/entities";
import type { DatabaseRow } from "../core/export-payload";
import type { DatabaseMutations } from "../records/mutation-bindings";
import type { DatabasePropertyFilterConfig } from "../schema/filter";
import type { DatabaseSortConfig } from "../views/configuration";
import type { DatabasePropertyListItem } from "../views/grouping";
import type { DatabaseViewData } from "../views/source-state";

/** Operations available to database planners; UI and server provide them. */
export type DatabaseOps = DatabaseMutations;
export type DatabaseStep = PlanStep<DatabaseOps>;
export type DatabasePlan = PlanOutcome<DatabaseOps>;

/**
 * The state a database intent reads. Clients derive it from their caches and
 * the server from authorized reads, using the same view model functions.
 */
export type DatabaseIntentState = {
  /** The active data source (the `databaseId` of property, row and source ops). */
  dataSourceId: string | null | undefined;
  /** The host database of the active view, when known. */
  hostDatabaseId?: string | null;
  editable: boolean;
  activeView: DatabaseViewEntity | null;
  activeDatabaseFilters: DatabasePropertyFilterConfig[];
  activeDatabaseSorts: DatabaseSortConfig[];
  properties: DatabasePropertyEntity[];
  items: DatabaseRow[];
  isKanbanView: boolean;
  kanbanGroupProperty: DatabasePropertyListItem | null;
  timelineDateProperty?: DatabasePropertyListItem | null;
  viewData: DatabaseViewData | null | undefined;
  /** Reads the freshest configuration of the active view, including pending edits. */
  latestViewConfig?: () => unknown;
};

export function viewHostId(state: DatabaseIntentState) {
  return state.hostDatabaseId ?? state.dataSourceId!;
}

export function hostScope(state: DatabaseIntentState) {
  return state.hostDatabaseId ? { hostDatabaseId: state.hostDatabaseId } : {};
}

/** Properties of the active source, falling back to the view model's list. */
export function sourceProperties(state: DatabaseIntentState) {
  const { viewData } = state;
  return viewData
    ? viewData.bootstrap.properties.filter(
        (property) => property.dataSourceId === viewData.dataSourceId,
      )
    : state.properties;
}

export function viewDataProperties(state: DatabaseIntentState) {
  const { viewData } = state;
  return viewData
    ? viewData.bootstrap.properties.filter(
        (property) => property.dataSourceId === viewData.dataSourceId,
      )
    : null;
}

export function currentViewConfig(state: DatabaseIntentState) {
  return state.latestViewConfig && state.activeView && state.dataSourceId
    ? state.latestViewConfig()
    : state.activeView?.config;
}

/** A prerequisite resolved either from existing state or by earlier plan steps. */
export type Prerequisite<T> = {
  steps: DatabaseStep[];
  resolve: (done: PlanResults) => T;
};
