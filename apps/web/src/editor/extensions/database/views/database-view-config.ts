import {
  defaultStatusOption,
  getDatabasePropertyFilterKind,
} from "../core/database-property-types";

import type {
  DateFormatValue,
  TimeFormatValue,
} from "../properties/database-date-config";
import type { DatabaseChartSettings } from "./chart/database-chart-config";

export type DatabaseSelectOption = {
  color?: string;
  id: string;
  name: string;
};

type FilesLimitValue = "one_file" | "no_limit";
export type NumberDecimalPlacesValue = "default" | 0 | 1 | 2 | 3 | 4 | 5;
export type DatabaseNumberDisplayStyle = "number" | "bar" | "ring";
type PersonLimitValue = "one_person" | "no_limit";
type PersonDefaultValue = "no_default" | "created_by";
type PersonNotificationsValue = "users_and_groups" | "users_only" | "none";
type RelationLimitValue = "one_page" | "no_limit";
type SelectOptionSortValue = "manual" | "alphabetical" | "reverse_alphabetical";
export type DatabaseConditionalColorApplyTarget =
  | "entire-row"
  | "this-property";
export type DatabaseConditionalColorStyle = "page-background";
export type DatabaseRollupCalculation =
  | "show_original"
  | "show_unique"
  | "count_all"
  | "count_values"
  | "count_unique"
  | "count_empty"
  | "count_not_empty"
  | "percent_empty"
  | "percent_not_empty"
  | "sum"
  | "average"
  | "median"
  | "min"
  | "max"
  | "range"
  | "earliest_date"
  | "latest_date"
  | "date_range";

export type DatabaseConditionalColorConfig = {
  applyTo: DatabaseConditionalColorApplyTarget;
  color: string;
  filter: DatabasePropertyFilterConfig;
  id: string;
  style: DatabaseConditionalColorStyle;
};

export type DatabaseLinkedViewConfig = {
  databaseId: string;
  databaseName: string;
  linkedViewId?: string;
  viewId: string;
  viewName: string;
  viewType: string;
};

export type DatabasePropertyConfig = {
  dateFormat?: DateFormatValue;
  defaultOptionId?: string;
  filesLimit?: FilesLimitValue;
  formula?: string;
  hidden?: boolean;
  numberDecimalPlaces?: NumberDecimalPlacesValue;
  numberDisplayColor?: string;
  numberDisplayDivideBy?: number;
  numberDisplayShowNumber?: boolean;
  numberDisplayStyle?: DatabaseNumberDisplayStyle;
  numberFormat?: string;
  personDefault?: PersonDefaultValue;
  personLimit?: PersonLimitValue;
  personNotifications?: PersonNotificationsValue;
  relation?: {
    limit?: RelationLimitValue;
    relatedDatabaseId?: string;
    relatedDatabaseName?: string;
    relatedPageName?: string;
    relatedPropertyId?: string;
    relatedPropertyName?: string;
    syncStatus?: "not_synced" | "synced";
    twoWayRelation?: boolean;
  };
  rollup?: {
    calculation?: DatabaseRollupCalculation;
    numberDisplayColor?: string;
    numberDisplayDivideBy?: number;
    numberDisplayShowNumber?: boolean;
    numberDisplayStyle?: DatabaseNumberDisplayStyle;
    numberDecimalPlaces?: NumberDecimalPlacesValue;
    numberFormat?: string;
    relationPropertyId?: string;
    targetPropertyId?: string;
  };
  selectOptionSort?: SelectOptionSortValue;
  showFullUrl?: boolean;
  timeFormat?: TimeFormatValue;
  wrapContent?: boolean;
  options?: DatabaseSelectOption[];
};

type DatabaseConfig = {
  chart?: DatabaseChartSettings;
  conditionalColors?: DatabaseConditionalColorConfig[];
  datePropertyId?: string;
  emoji?: string;
  filters?: DatabaseFilterItemConfig[];
  groupPropertyId?: string;
  hiddenPropertyIds?: string[];
  linkedDatabaseViews?: DatabaseLinkedViewConfig[];
  nameColumn?: DatabaseNameColumnConfig;
  propertyOrder?: string[];
  showPropertyTitles?: boolean;
  setupDismissed?: boolean;
  sorts?: DatabaseSortConfig[];
};

export type DatabaseNameColumnConfig = {
  label?: string;
  showPageIcon?: boolean;
  wrapContent?: boolean;
};

export type DatabaseSortDirection = "ascending" | "descending";

export type DatabaseSortConfig = {
  column: string;
  direction: DatabaseSortDirection;
};

export type DatabaseFilterGroupOperator = "and" | "or";

export type DatabasePropertyFilterOperator =
  | "is"
  | "is_not"
  | "contains"
  | "does_not_contain"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal"
  | "is_before"
  | "is_after"
  | "is_on_or_before"
  | "is_on_or_after"
  | "is_between"
  | "is_relative_to_today"
  | "is_empty"
  | "is_not_empty";

export type DatabasePropertyFilterConfig = {
  id: string;
  joinOperator?: DatabaseFilterGroupOperator;
  operator: DatabasePropertyFilterOperator;
  propertyId: "name" | string;
  values: string[];
};

export type DatabaseFilterGroupConfig = {
  filters: DatabaseFilterItemConfig[];
  id: string;
  joinOperator?: DatabaseFilterGroupOperator;
  operator: DatabaseFilterGroupOperator;
  type: "group";
};

export type DatabaseFilterItemConfig =
  | DatabaseFilterGroupConfig
  | DatabasePropertyFilterConfig;

export const databasePropertyFilterOperators: {
  label: string;
  value: DatabasePropertyFilterOperator;
}[] = [
  { label: "Is", value: "is" },
  { label: "Is not", value: "is_not" },
  { label: "Contains", value: "contains" },
  { label: "Does not contain", value: "does_not_contain" },
  { label: "Starts with", value: "starts_with" },
  { label: "Ends with", value: "ends_with" },
  { label: "Is empty", value: "is_empty" },
  { label: "Is not empty", value: "is_not_empty" },
];

export const databaseNumberFilterOperators: {
  label: string;
  value: DatabasePropertyFilterOperator;
}[] = [
  { label: "Is", value: "is" },
  { label: "Is not", value: "is_not" },
  { label: "Greater than", value: "greater_than" },
  { label: "Less than", value: "less_than" },
  { label: "Greater than or equal", value: "greater_than_or_equal" },
  { label: "Less than or equal", value: "less_than_or_equal" },
  { label: "Is empty", value: "is_empty" },
  { label: "Is not empty", value: "is_not_empty" },
];

export const databaseDateFilterOperators: {
  label: string;
  value: DatabasePropertyFilterOperator;
}[] = [
  { label: "Is", value: "is" },
  { label: "Is not", value: "is_not" },
  { label: "Is before", value: "is_before" },
  { label: "Is after", value: "is_after" },
  { label: "Is on or before", value: "is_on_or_before" },
  { label: "Is on or after", value: "is_on_or_after" },
  { label: "Is between", value: "is_between" },
  { label: "Is relative to today", value: "is_relative_to_today" },
  { label: "Is empty", value: "is_empty" },
  { label: "Is not empty", value: "is_not_empty" },
];

export function getDatabaseFilterOperatorLabel(
  operator: DatabasePropertyFilterOperator,
) {
  return (
    [
      ...databasePropertyFilterOperators,
      ...databaseNumberFilterOperators,
      ...databaseDateFilterOperators,
    ].find((item) => item.value === operator)?.label ?? "Is"
  );
}

export function getDatabaseFilterOperatorsForType(type: string) {
  const filterKind = getDatabasePropertyFilterKind(type);

  if (filterKind === "checkbox") {
    return databasePropertyFilterOperators.filter((operator) =>
      ["is", "is_not"].includes(operator.value),
    );
  }

  if (filterKind === "date") {
    return databaseDateFilterOperators;
  }

  if (filterKind === "number") {
    return databaseNumberFilterOperators;
  }

  if (filterKind === "person") {
    return databasePropertyFilterOperators.filter((operator) =>
      ["contains", "does_not_contain", "is_empty", "is_not_empty"].includes(
        operator.value,
      ),
    );
  }

  if (filterKind === "files") {
    return databasePropertyFilterOperators.filter((operator) =>
      ["is_empty", "is_not_empty"].includes(operator.value),
    );
  }

  return databasePropertyFilterOperators;
}

export function getValidDatabaseFilterOperator(
  operator: DatabasePropertyFilterOperator,
  type: string,
) {
  const operators = getDatabaseFilterOperatorsForType(type);

  return operators.some((item) => item.value === operator)
    ? operator
    : (operators[0]?.value ?? "is");
}

export function getDatabaseSorts(config: unknown): DatabaseSortConfig[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return [];
  }

  const sorts = (config as DatabaseConfig).sorts;

  if (Array.isArray(sorts)) {
    return sorts.filter(isDatabaseSortConfig);
  }

  return [];
}

export function getDatabaseFilters(
  config: unknown,
): DatabaseFilterItemConfig[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return [];
  }

  const filters = (config as DatabaseConfig).filters;

  if (Array.isArray(filters)) {
    return normalizeDatabaseFilters(filters);
  }

  return [];
}

export function getDatabaseConditionalColors(
  config: unknown,
): DatabaseConditionalColorConfig[] {
  const conditionalColors =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as DatabaseConfig).conditionalColors
      : undefined;

  if (!Array.isArray(conditionalColors)) {
    return [];
  }

  return conditionalColors.flatMap((value, index) => {
    const setting = normalizeDatabaseConditionalColor(
      value,
      `conditional-color-${index}`,
    );

    return setting ? [setting] : [];
  });
}

export function getDatabaseLinkedViews(
  config: unknown,
): DatabaseLinkedViewConfig[] {
  const linkedViews =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as DatabaseConfig).linkedDatabaseViews
      : undefined;

  if (!Array.isArray(linkedViews)) {
    return [];
  }

  const seenKeys = new Set<string>();

  return linkedViews.flatMap((linkedView) => {
    const normalized = normalizeDatabaseLinkedView(linkedView);

    if (!normalized) {
      return [];
    }

    const key = getDatabaseLinkedViewKey(normalized);

    if (seenKeys.has(key)) {
      return [];
    }

    seenKeys.add(key);
    return [normalized];
  });
}

export function getDatabaseLinkedViewKey(view: DatabaseLinkedViewConfig) {
  if (view.linkedViewId) {
    return `linked:${view.linkedViewId}`;
  }

  return `linked:${view.databaseId}:${view.viewId}`;
}

export function getDatabaseSetupDismissed(config: unknown) {
  return Boolean(
    config &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    (config as DatabaseConfig).setupDismissed === true,
  );
}

export function getMergedDatabaseConfig(
  config: unknown,
  nextConfig: Partial<DatabaseConfig>,
) {
  return {
    ...(config && typeof config === "object" && !Array.isArray(config)
      ? config
      : {}),
    ...nextConfig,
  };
}

export function getMergedNameColumnConfig(
  config: unknown,
  nextConfig: DatabaseNameColumnConfig,
) {
  return getMergedDatabaseConfig(config, {
    nameColumn: {
      ...getNameColumnConfig(config),
      ...nextConfig,
    },
  });
}

export function getMergedPropertyConfig(
  config: unknown,
  nextConfig: DatabasePropertyConfig,
) {
  return {
    ...(config && typeof config === "object" ? config : {}),
    ...nextConfig,
  };
}

export function upsertDatabaseSort(
  sorts: DatabaseSortConfig[],
  nextSort: DatabaseSortConfig,
) {
  const existingSortIndex = sorts.findIndex(
    (sort) => sort.column === nextSort.column,
  );

  if (existingSortIndex === -1) {
    return [...sorts, nextSort];
  }

  return sorts.map((sort, index) =>
    index === existingSortIndex ? nextSort : sort,
  );
}

export function getStatusDefaultOptionId(config: unknown) {
  if (!config || typeof config !== "object" || !("defaultOptionId" in config)) {
    return defaultStatusOption.id;
  }

  const defaultOptionId = (config as DatabasePropertyConfig).defaultOptionId;

  return typeof defaultOptionId === "string"
    ? defaultOptionId
    : defaultStatusOption.id;
}

export function getShowFullUrl(config: unknown) {
  if (!config || typeof config !== "object" || !("showFullUrl" in config)) {
    return false;
  }

  return (config as DatabasePropertyConfig).showFullUrl === true;
}

export function getPropertyWrapContent(config: unknown) {
  if (!config || typeof config !== "object" || !("wrapContent" in config)) {
    return false;
  }

  return (config as DatabasePropertyConfig).wrapContent === true;
}

export function getPropertyHidden(config: unknown) {
  if (!config || typeof config !== "object" || !("hidden" in config)) {
    return false;
  }

  return (config as DatabasePropertyConfig).hidden === true;
}

export function getViewHiddenPropertyIds(config: unknown) {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !("hiddenPropertyIds" in config)
  ) {
    return [];
  }

  const hiddenPropertyIds = (config as DatabaseConfig).hiddenPropertyIds;

  return Array.isArray(hiddenPropertyIds)
    ? hiddenPropertyIds.filter(
        (propertyId): propertyId is string => typeof propertyId === "string",
      )
    : [];
}

export function getShowPropertyTitles(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return false;
  }

  return (config as DatabaseConfig).showPropertyTitles === true;
}

export function getDatabasePropertyOrder(config: unknown) {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !("propertyOrder" in config)
  ) {
    return [];
  }

  const propertyOrder = (config as DatabaseConfig).propertyOrder;

  return Array.isArray(propertyOrder)
    ? propertyOrder.filter(
        (propertyId): propertyId is string => typeof propertyId === "string",
      )
    : [];
}

export function getPropertyHiddenForView(
  propertyId: string,
  propertyConfig: unknown,
  viewConfig: unknown,
) {
  const hasViewVisibilityConfig =
    viewConfig !== null &&
    typeof viewConfig === "object" &&
    !Array.isArray(viewConfig) &&
    "hiddenPropertyIds" in viewConfig;
  const hiddenPropertyIds = getViewHiddenPropertyIds(viewConfig);

  return hasViewVisibilityConfig
    ? hiddenPropertyIds.includes(propertyId)
    : getPropertyHidden(propertyConfig);
}

export function getPersonLimit(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "no_limit";
  }

  const personLimit = (config as DatabasePropertyConfig).personLimit;

  return personLimit === "one_person" ? "one_person" : "no_limit";
}

export function getNumberFormat(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "number";
  }

  const numberFormat = (config as DatabasePropertyConfig).numberFormat;

  return typeof numberFormat === "string" && numberFormat.trim().length > 0
    ? numberFormat
    : "number";
}

export function getNumberDecimalPlaces(
  config: unknown,
): NumberDecimalPlacesValue {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "default";
  }

  const numberDecimalPlaces = (config as DatabasePropertyConfig)
    .numberDecimalPlaces;

  return isNumberDecimalPlacesValue(numberDecimalPlaces)
    ? numberDecimalPlaces
    : "default";
}

export function getNumberDisplayStyle(
  config: unknown,
): DatabaseNumberDisplayStyle {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "number";
  }

  const numberDisplayStyle = (config as DatabasePropertyConfig)
    .numberDisplayStyle;

  return isDatabaseNumberDisplayStyle(numberDisplayStyle)
    ? numberDisplayStyle
    : "number";
}

export function getNumberDisplayColor(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "green";
  }

  const numberDisplayColor = (config as DatabasePropertyConfig)
    .numberDisplayColor;

  return typeof numberDisplayColor === "string" && numberDisplayColor.length > 0
    ? numberDisplayColor
    : "green";
}

export function getNumberDisplayDivideBy(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return 100;
  }

  const numberDisplayDivideBy = (config as DatabasePropertyConfig)
    .numberDisplayDivideBy;

  return typeof numberDisplayDivideBy === "number" &&
    Number.isFinite(numberDisplayDivideBy) &&
    numberDisplayDivideBy > 0
    ? numberDisplayDivideBy
    : 100;
}

export function getNumberDisplayShowNumber(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return true;
  }

  const numberDisplayShowNumber = (config as DatabasePropertyConfig)
    .numberDisplayShowNumber;

  return numberDisplayShowNumber !== false;
}

export function getNameColumnLabel(config: unknown) {
  const label = getNameColumnConfig(config).label;

  return typeof label === "string" && label.trim().length > 0
    ? label.trim()
    : "Name";
}

export function getNameColumnShowPageIcon(config: unknown) {
  const showPageIcon = getNameColumnConfig(config).showPageIcon;

  return showPageIcon !== false;
}

export function getNameColumnWrapContent(config: unknown) {
  const wrapContent = getNameColumnConfig(config).wrapContent;

  return wrapContent !== false;
}

function isDatabaseSortDirection(
  value: unknown,
): value is DatabaseSortDirection {
  return value === "ascending" || value === "descending";
}

function isNumberDecimalPlacesValue(
  value: unknown,
): value is NumberDecimalPlacesValue {
  return value === "default" || [0, 1, 2, 3, 4, 5].includes(value as number);
}

function isDatabaseNumberDisplayStyle(
  value: unknown,
): value is DatabaseNumberDisplayStyle {
  return value === "number" || value === "bar" || value === "ring";
}

function isDatabaseSortConfig(value: unknown): value is DatabaseSortConfig {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as DatabaseSortConfig).column === "string" &&
    (value as DatabaseSortConfig).column.length > 0 &&
    isDatabaseSortDirection((value as DatabaseSortConfig).direction)
  );
}

function normalizeDatabaseLinkedView(
  value: unknown,
): DatabaseLinkedViewConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const linkedView = value as DatabaseLinkedViewConfig;

  if (
    typeof linkedView.databaseId !== "string" ||
    linkedView.databaseId.length === 0 ||
    typeof linkedView.viewId !== "string" ||
    linkedView.viewId.length === 0
  ) {
    return null;
  }

  return {
    databaseId: linkedView.databaseId,
    databaseName:
      typeof linkedView.databaseName === "string" &&
      linkedView.databaseName.trim().length > 0
        ? linkedView.databaseName
        : "Untitled database",
    linkedViewId:
      typeof linkedView.linkedViewId === "string" &&
      linkedView.linkedViewId.length > 0
        ? linkedView.linkedViewId
        : undefined,
    viewId: linkedView.viewId,
    viewName:
      typeof linkedView.viewName === "string" &&
      linkedView.viewName.trim().length > 0
        ? linkedView.viewName
        : "Untitled view",
    viewType:
      typeof linkedView.viewType === "string" &&
      linkedView.viewType.trim().length > 0
        ? linkedView.viewType
        : "table",
  };
}

export function isDatabaseFilterGroup(
  filter: DatabaseFilterItemConfig,
): filter is DatabaseFilterGroupConfig {
  return "type" in filter && filter.type === "group";
}

function normalizeDatabaseFilters(values: unknown[]) {
  return values.flatMap((value, index) => {
    const filter = normalizeDatabaseFilter(value, `filter-${index}`);

    return filter ? [filter] : [];
  });
}

function normalizeDatabaseFilter(
  value: unknown,
  fallbackId: string,
): DatabaseFilterItemConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const valueRecord = value as Record<string, unknown>;

  if (valueRecord.type === "group" && Array.isArray(valueRecord.filters)) {
    const operator = valueRecord.operator;

    return {
      filters: normalizeDatabaseFilters(valueRecord.filters),
      id: getDatabaseFilterId(value, fallbackId),
      joinOperator: getDatabaseFilterGroupOperator(valueRecord.joinOperator),
      operator: getDatabaseFilterGroupOperator(operator) ?? "and",
      type: "group",
    };
  }

  const propertyId = getDatabaseFilterPropertyId(valueRecord.propertyId);
  const operator = getDatabasePropertyFilterOperator(valueRecord.operator);

  if (!propertyId || !operator) {
    return null;
  }

  return {
    id: getDatabaseFilterId(value, fallbackId),
    joinOperator: getDatabaseFilterGroupOperator(valueRecord.joinOperator),
    operator,
    propertyId,
    values: getDatabaseFilterValues(valueRecord.values),
  };
}

function normalizeDatabaseConditionalColor(
  value: unknown,
  fallbackId: string,
): DatabaseConditionalColorConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const valueRecord = value as Record<string, unknown>;
  const normalizedFilter = normalizeDatabaseFilter(
    valueRecord.filter,
    `${fallbackId}-filter`,
  );

  if (!normalizedFilter || isDatabaseFilterGroup(normalizedFilter)) {
    return null;
  }

  return {
    applyTo:
      valueRecord.applyTo === "this-property" ? "this-property" : "entire-row",
    color: typeof valueRecord.color === "string" ? valueRecord.color : "green",
    filter: normalizedFilter,
    id: getDatabaseFilterId(value, fallbackId),
    style: "page-background",
  };
}

function getDatabaseFilterId(value: object, fallbackId: string) {
  const id = (value as { id?: unknown }).id;

  return typeof id === "string" && id.length > 0 ? id : fallbackId;
}

function getDatabaseFilterPropertyId(value: unknown) {
  if (value === "title") {
    return "name";
  }

  return typeof value === "string" && value.length > 0 ? value : null;
}

function getDatabaseFilterValues(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) =>
    typeof item === "string" ||
    typeof item === "number" ||
    typeof item === "boolean"
      ? [String(item)]
      : [],
  );
}

function getDatabasePropertyFilterOperator(
  value: unknown,
): DatabasePropertyFilterOperator | null {
  return [
    ...databasePropertyFilterOperators,
    ...databaseNumberFilterOperators,
    ...databaseDateFilterOperators,
  ].some((operator) => operator.value === value)
    ? (value as DatabasePropertyFilterOperator)
    : null;
}

function getDatabaseFilterGroupOperator(
  value: unknown,
): DatabaseFilterGroupOperator | undefined {
  return value === "and" || value === "or" ? value : undefined;
}

function getNameColumnConfig(config: unknown) {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !("nameColumn" in config)
  ) {
    return {};
  }

  const nameColumn = (config as DatabaseConfig).nameColumn;

  return nameColumn &&
    typeof nameColumn === "object" &&
    !Array.isArray(nameColumn)
    ? nameColumn
    : {};
}
