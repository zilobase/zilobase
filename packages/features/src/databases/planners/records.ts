import { rejectPlan } from "../../actions/plan";
import { diffConfiguration } from "../interactions/configuration";
import { areSerializedPropertyValuesEqual } from "../interactions/item-utils";
import {
  getDefaultDatabasePropertyConfig,
  getEffectiveStatusValue,
} from "../schema/property-defaults";
import type { DatabasePropertyValue } from "../schema/property-values";
import { serializePropertyValue } from "../schema/property-values";
import { getRelationLimitTrimUpdates, relationPayloadFromViewData } from "../schema/relations";
import {
  calendarScheduleToValue,
  getCalendarDateProperty,
  type DatabaseCalendarSchedule,
} from "../views/calendar";
import type { DatabaseNameColumnConfig, DatabasePropertyConfig } from "../views/configuration";
import {
  getDatabaseSubItemsSettings,
  getMergedDatabaseConfig,
  getMergedNameColumnConfig,
  getMergedPropertyConfig,
} from "../views/configuration";
import type { DatabasePropertyListItem } from "../views/grouping";
import { ganttMoveToDateValue } from "../views/timeline-date";
import { getNewRowGroupSetup, type NewRowSetup } from "../records/row-plans";
import {
  hostScope,
  sourceProperties,
  viewDataProperties,
  type DatabaseIntentState,
  type DatabasePlan,
  type DatabaseStep,
} from "./state";

// Properties

export function planAddProperty(
  state: DatabaseIntentState,
  type = "text",
  name = "Property",
  position?: number,
): DatabasePlan {
  if (!state.editable || !state.dataSourceId) return rejectPlan("not_editable");
  return {
    steps: [
      {
        id: "property",
        op: "addProperty",
        input: () => ({
          config: getDefaultDatabasePropertyConfig(type),
          databaseId: state.dataSourceId!,
          name,
          position,
          type,
        }),
      },
    ],
  };
}

export function planRenameProperty(
  state: DatabaseIntentState,
  databasePropertyId: string,
  name: string,
): DatabasePlan {
  if (!state.dataSourceId) return rejectPlan("no_data_source");
  return {
    steps: [
      {
        op: "updateProperty",
        input: () => ({ databaseId: state.dataSourceId!, databasePropertyId, name }),
      },
    ],
  };
}

/** Merges a property configuration and trims relation values above a new limit. */
export function planUpdatePropertyConfig(
  state: DatabaseIntentState,
  databasePropertyId: string,
  config: unknown,
): DatabasePlan {
  if (!state.dataSourceId) return rejectPlan("no_data_source");
  const current = viewDataProperties(state)?.find((property) => property.id === databasePropertyId)
    ?.property.config;
  const next = getMergedPropertyConfig(current, config as DatabasePropertyConfig);
  const trims: DatabaseStep[] = getRelationLimitTrimUpdates({
    databasePropertyId,
    payload: relationPayloadFromViewData(state.viewData),
    propertyConfig: next,
  }).map((update) => ({
    op: "updateValue",
    input: () => ({
      databaseId: state.dataSourceId!,
      ...hostScope(state),
      propertyId: update.propertyId,
      rowId: update.rowId,
      value: update.value,
    }),
    admit: "dispatch",
  }));
  return {
    steps: [
      ...trims,
      {
        id: "property",
        op: "updateProperty",
        input: () => ({
          configuration: diffConfiguration(current, next),
          databaseId: state.dataSourceId!,
          databasePropertyId,
        }),
      },
    ],
  };
}

// Database metadata

function databaseConfig(state: DatabaseIntentState) {
  return state.viewData?.bootstrap.database.config;
}

export function planSaveDatabaseEmoji(state: DatabaseIntentState, emoji: string): DatabasePlan {
  if (!state.editable || !state.dataSourceId) return rejectPlan("not_editable");
  const current = databaseConfig(state);
  return {
    steps: [
      {
        op: "updateDatabase",
        input: () => ({
          configuration: diffConfiguration(current, getMergedDatabaseConfig(current, { emoji })),
          databaseId: state.dataSourceId!,
        }),
      },
    ],
  };
}

export function planSaveDatabaseTitle(state: DatabaseIntentState, name: string): DatabasePlan {
  if (!state.dataSourceId) return rejectPlan("no_data_source");
  if (name === state.viewData?.activeDataSource?.name) return rejectPlan("unchanged");
  return {
    steps: [{ op: "updateDatabase", input: () => ({ databaseId: state.dataSourceId!, name }) }],
  };
}

export function planUpdateNameColumn(
  state: DatabaseIntentState,
  config: DatabaseNameColumnConfig,
): DatabasePlan {
  if (!state.editable || !state.dataSourceId) return rejectPlan("not_editable");
  const current = databaseConfig(state);
  return {
    steps: [
      {
        op: "updateDatabase",
        input: () => ({
          configuration: diffConfiguration(current, getMergedNameColumnConfig(current, config)),
          databaseId: state.dataSourceId!,
        }),
      },
    ],
  };
}

// Rows

export function planSavePropertyValue(
  state: DatabaseIntentState,
  input: {
    rowId: string;
    propertyId: string;
    propertyType: string;
    currentValue: DatabasePropertyValue;
    nextValue: DatabasePropertyValue;
  },
): DatabasePlan {
  if (!state.editable || !state.dataSourceId) return rejectPlan("not_editable");
  if (areSerializedPropertyValuesEqual(input.propertyType, input.currentValue, input.nextValue))
    return rejectPlan("unchanged");
  return {
    steps: [
      {
        op: "updateValue",
        input: () => ({
          databaseId: state.dataSourceId!,
          ...hostScope(state),
          propertyId: input.propertyId,
          rowId: input.rowId,
          value: serializePropertyValue(input.propertyType, input.nextValue),
        }),
      },
    ],
  };
}

/** Adds a row with deduplicated initial values and optional sub-item parent. */
export function planAddRowWithValues(
  state: DatabaseIntentState,
  { parentRelation, propertyValues, title }: NewRowSetup,
): DatabasePlan {
  if (!state.editable || !state.dataSourceId) return rejectPlan("not_editable");
  const values = new Map(propertyValues.map((value) => [value.propertyId, value]));
  return {
    steps: [
      {
        id: "row",
        op: "addRow",
        input: () => ({
          databaseId: state.dataSourceId!,
          ...hostScope(state),
          ...(values.size ? { initialValues: [...values.values()] } : {}),
          title,
          ...(parentRelation
            ? {
                hierarchy: {
                  parentRowId: parentRelation.parentRow.id,
                  parentPropertyId: parentRelation.parentPropertyId,
                  subItemPropertyId: parentRelation.subItemPropertyId,
                },
              }
            : {}),
        }),
      },
    ],
  };
}

export function planAddDatabaseRow(
  state: DatabaseIntentState,
  groupValue?: string,
  groupPropertyOverride?: DatabasePropertyListItem | null,
  parentRowId?: string | null,
): DatabasePlan {
  const { isKanbanView, kanbanGroupProperty } = state;
  const defaultStatusValue = getEffectiveStatusValue(null, kanbanGroupProperty?.property.config);
  const groupProperty = groupPropertyOverride ?? (isKanbanView ? kanbanGroupProperty : null);
  const value =
    groupValue ??
    (isKanbanView && kanbanGroupProperty?.property.type === "status" ? defaultStatusValue : null);
  const groupSetup = getNewRowGroupSetup(value, groupProperty);
  const subItems = getDatabaseSubItemsSettings(
    state.activeView?.config ?? state.viewData?.bootstrap.database.config,
  );
  if (parentRowId && (!subItems.parentPropertyId || !subItems.subItemPropertyId))
    return rejectPlan(
      "sub_items_not_ready",
      "Sub-items are still being set up. Try again shortly.",
    );
  const parentRow = parentRowId ? state.items.find((row) => row.id === parentRowId) : undefined;
  if (parentRowId && !parentRow)
    return rejectPlan("parent_missing", "Parent item is no longer available.");
  const parentRelation =
    parentRow && subItems.parentPropertyId && subItems.subItemPropertyId
      ? {
          parentPropertyId: subItems.parentPropertyId,
          parentRow,
          subItemPropertyId: subItems.subItemPropertyId,
        }
      : undefined;
  return planAddRowWithValues(state, {
    ...(parentRelation ? { parentRelation } : {}),
    ...groupSetup,
    ...(parentRelation
      ? {
          propertyValues: [
            ...groupSetup.propertyValues,
            { propertyId: parentRelation.parentPropertyId, value: parentRelation.parentRow.pageId },
          ],
        }
      : {}),
  });
}

export function planAddTimelineRow(
  state: DatabaseIntentState,
  startAt: Date,
  endAt: Date,
  groupValue?: string,
  groupProperty?: DatabasePropertyListItem | null,
): DatabasePlan {
  const dateProperty = state.timelineDateProperty;
  if (!dateProperty) return rejectPlan("no_date_property");
  const groupSetup = getNewRowGroupSetup(groupValue, groupProperty);
  return planAddRowWithValues(state, {
    propertyValues: [
      { propertyId: dateProperty.property.id, value: ganttMoveToDateValue(startAt, endAt) },
      ...groupSetup.propertyValues,
    ],
    title: groupSetup.title,
  });
}

export function planAddCalendarRow(
  state: DatabaseIntentState,
  schedule: DatabaseCalendarSchedule,
): DatabasePlan {
  const dateProperty = getCalendarDateProperty(sourceProperties(state), state.activeView?.config);
  if (!state.editable || !state.dataSourceId || !dateProperty)
    return rejectPlan("not_editable", "Calendar is not editable or has no date property");
  return {
    steps: [
      {
        id: "row",
        op: "addRow",
        input: () => ({
          databaseId: state.dataSourceId!,
          ...hostScope(state),
          title: "",
          initialValues: [
            {
              propertyId: dateProperty.property.id,
              value: serializePropertyValue("date", calendarScheduleToValue(schedule)),
            },
          ],
        }),
      },
    ],
  };
}
