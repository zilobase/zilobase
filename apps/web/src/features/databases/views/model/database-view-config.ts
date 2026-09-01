import {
  databaseDateFilterOperators,
  databaseNumberFilterOperators,
  databasePropertyFilterOperators,
  getDatabaseFilterOperatorLabel,
  getDatabaseFilterOperatorsForType,
  getValidDatabaseFilterOperator,
  isDatabaseFilterGroup,
  normalizeDatabaseFilter,
  normalizeDatabaseFilters,
  type DatabaseFilterGroupConfig,
  type DatabaseFilterGroupOperator,
  type DatabaseFilterItemConfig,
  type DatabasePropertyFilterConfig,
  type DatabasePropertyFilterOperator,
} from "@zilobase/features/databases/filter";
import { defaultStatusOption } from "../../core/database-property-types";

export {
  databaseDateFilterOperators,
  databaseNumberFilterOperators,
  databasePropertyFilterOperators,
  getDatabaseFilterOperatorLabel,
  getDatabaseFilterOperatorsForType,
  getValidDatabaseFilterOperator,
  isDatabaseFilterGroup,
};
export type {
  DatabaseFilterGroupConfig,
  DatabaseFilterGroupOperator,
  DatabaseFilterItemConfig,
  DatabasePropertyFilterConfig,
  DatabasePropertyFilterOperator,
};

import type {
  DateFormatValue,
  TimeFormatValue,
} from "../../properties/model/database-date-config";
import type { DatabaseChartSettings } from "../chart/model/database-chart-config";
import type { DatabaseFormHeaderSettings } from "../form/model/database-form-header-config";
import type { DatabaseFormQuestionSettingsPatch } from "../form/model/database-form-question-config";
import type { DatabaseFormShareSettings } from "../form/model/database-form-share-config";

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
  "entire-row" | "this-property";
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

export type DatabaseSubItemsDisplay = "nested" | "flattened" | "disabled";
export type DatabaseSubItemsFilter =
  "parents-only" | "parents-and-sub-items" | "sub-items-only";
export type DatabaseSubItemsProperty = "sub-item" | "parent-item";

export type DatabaseSubItemsSettings = {
  display: DatabaseSubItemsDisplay;
  enabled: boolean;
  filter: DatabaseSubItemsFilter;
  parentPropertyId?: string;
  property: DatabaseSubItemsProperty;
  subItemPropertyId?: string;
};

export const defaultDatabaseSubItemsSettings: DatabaseSubItemsSettings = {
  display: "nested",
  enabled: false,
  filter: "parents-only",
  property: "sub-item",
};

export type DatabasePropertyConfig = {
  dateFormat?: DateFormatValue;
  defaultOptionId?: string;
  filesLimit?: FilesLimitValue;
  formula?: string;
  hidden?: boolean;
  icon?: string;
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
  formHeader?: DatabaseFormHeaderSettings;
  formQuestions?: Record<string, DatabaseFormQuestionSettingsPatch>;
  formShare?: DatabaseFormShareSettings;
  groupPropertyId?: string;
  icon?: string;
  hiddenPropertyIds?: string[];
  layout?: DatabaseLayoutSettings;
  nameColumn?: DatabaseNameColumnConfig;
  propertyOrder?: string[];
  showPropertyTitles?: boolean;
  setupDismissed?: boolean;
  sorts?: DatabaseSortConfig[];
  subItems?: DatabaseSubItemsSettings;
};

export type DatabaseNameColumnConfig = {
  icon?: string;
  label?: string;
  showPageIcon?: boolean;
  wrapContent?: boolean;
};

export type DatabaseLayoutSettings = {
  cardLayout: "compact" | "list";
  cardPreview: "none" | "page-cover";
  cardSize: "small" | "medium" | "large";
  fullLinePropertyIds: string[];
  showVerticalLines: boolean;
  wrapAllContent: boolean;
};

export const defaultDatabaseLayoutSettings: DatabaseLayoutSettings = {
  cardLayout: "compact",
  cardPreview: "page-cover",
  cardSize: "medium",
  fullLinePropertyIds: [],
  showVerticalLines: true,
  wrapAllContent: false,
};

export type DatabaseSortDirection = "ascending" | "descending";

export type DatabaseSortConfig = {
  column: string;
  direction: DatabaseSortDirection;
};


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

export function getDatabaseSubItemsSettings(
  config: unknown,
): DatabaseSubItemsSettings {
  const subItems =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as DatabaseConfig).subItems
      : undefined;

  if (!subItems || typeof subItems !== "object" || Array.isArray(subItems)) {
    return defaultDatabaseSubItemsSettings;
  }

  return {
    display: ["nested", "flattened", "disabled"].includes(subItems.display)
      ? subItems.display
      : defaultDatabaseSubItemsSettings.display,
    enabled: subItems.enabled === true,
    filter: [
      "parents-only",
      "parents-and-sub-items",
      "sub-items-only",
    ].includes(subItems.filter)
      ? subItems.filter
      : defaultDatabaseSubItemsSettings.filter,
    ...(typeof subItems.parentPropertyId === "string" &&
    subItems.parentPropertyId
      ? { parentPropertyId: subItems.parentPropertyId }
      : {}),
    property: ["sub-item", "parent-item"].includes(subItems.property)
      ? subItems.property
      : defaultDatabaseSubItemsSettings.property,
    ...(typeof subItems.subItemPropertyId === "string" &&
    subItems.subItemPropertyId
      ? { subItemPropertyId: subItems.subItemPropertyId }
      : {}),
  };
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

export function getDatabaseLayoutSettings(
  config: unknown,
): DatabaseLayoutSettings {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !("layout" in config)
  ) {
    return defaultDatabaseLayoutSettings;
  }

  const layout = (config as DatabaseConfig).layout;

  if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
    return defaultDatabaseLayoutSettings;
  }

  return {
    cardLayout: layout.cardLayout === "list" ? "list" : "compact",
    cardPreview: layout.cardPreview === "none" ? "none" : "page-cover",
    cardSize: ["small", "medium", "large"].includes(layout.cardSize)
      ? layout.cardSize
      : "medium",
    fullLinePropertyIds: Array.isArray(layout.fullLinePropertyIds)
      ? layout.fullLinePropertyIds.filter(
          (propertyId): propertyId is string => typeof propertyId === "string",
        )
      : [],
    showVerticalLines: layout.showVerticalLines !== false,
    wrapAllContent: layout.wrapAllContent === true,
  };
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
  if (getSubItemRelationRole(propertyConfig)) return true;

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

export function getSubItemRelationRole(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const subItems = (config as { subItems?: unknown }).subItems;

  if (!subItems || typeof subItems !== "object" || Array.isArray(subItems)) {
    return null;
  }

  const role = (subItems as { role?: unknown }).role;

  return role === "parent-item" || role === "sub-item" ? role : null;
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

export function getNameColumnIcon(config: unknown) {
  const icon = getNameColumnConfig(config).icon;

  return typeof icon === "string" ? icon : "";
}

export function getDatabasePropertyIcon(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "";
  }

  const icon = (config as DatabasePropertyConfig).icon;

  return typeof icon === "string" ? icon : "";
}

export function getDatabaseViewIcon(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "";
  }

  const icon = (config as { icon?: unknown }).icon;

  return typeof icon === "string" ? icon : "";
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
    id:
      typeof valueRecord.id === "string" && valueRecord.id.length > 0
        ? valueRecord.id
        : fallbackId,
    style: "page-background",
  };
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
