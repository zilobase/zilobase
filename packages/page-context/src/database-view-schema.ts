import type { DatabaseContextPayload, DatabasePropertySchema } from "./types";

export type DatabaseLinkedViewConfig = {
  databaseId: string;
  databaseName: string;
  linkedViewId?: string;
  viewId: string;
  viewName: string;
  viewType: string;
};

export type DatabaseSortConfig = {
  column: string;
  direction: "ascending" | "descending";
};

export type DatabasePropertyFilterConfig = {
  operator: string;
  propertyId: "name" | string;
  values: string[];
};

type DatabaseConfig = {
  filter?: unknown;
  filters?: unknown[];
  groupPropertyId?: string;
  hiddenPropertyIds?: string[];
  linkedDatabaseViews?: unknown[];
  nameColumn?: { label?: string };
  sort?: unknown;
  sorts?: unknown[];
};

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

export function getNameColumnLabel(config: unknown) {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !("nameColumn" in config)
  ) {
    return "Name";
  }

  const nameColumn = (config as DatabaseConfig).nameColumn;
  const label =
    nameColumn && typeof nameColumn === "object" && !Array.isArray(nameColumn)
      ? nameColumn.label
      : undefined;

  return typeof label === "string" && label.trim().length > 0
    ? label.trim()
    : "Name";
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

export function getPropertyHidden(config: unknown) {
  if (!config || typeof config !== "object" || !("hidden" in config)) {
    return false;
  }

  return (config as { hidden?: unknown }).hidden === true;
}

export function hasViewHiddenPropertyIds(config: unknown) {
  return (
    config !== null &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    "hiddenPropertyIds" in config
  );
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

export function getActiveVisibilityConfig({
  activeViewConfig,
  isKanbanView,
  properties,
}: {
  activeViewConfig: unknown;
  isKanbanView: boolean;
  properties: DatabasePropertySchema[];
}) {
  if (!isKanbanView || hasViewHiddenPropertyIds(activeViewConfig)) {
    return activeViewConfig;
  }

  return {
    ...(activeViewConfig && typeof activeViewConfig === "object"
      ? activeViewConfig
      : {}),
    hiddenPropertyIds: properties.map((property) => property.id),
  };
}

export function getDatabaseSorts(config: unknown): DatabaseSortConfig[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return [];
  }

  const record = config as DatabaseConfig;
  const sorts = record.sorts;

  if (Array.isArray(sorts)) {
    return sorts.filter(isDatabaseSortConfig);
  }

  const sort = record.sort;

  return isDatabaseSortConfig(sort) ? [sort] : [];
}

export function getDatabaseFilters(
  config: unknown,
): DatabasePropertyFilterConfig[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return [];
  }

  const record = config as DatabaseConfig;
  const filters = record.filters;

  if (Array.isArray(filters)) {
    return normalizeDatabaseFilters(filters);
  }

  const filter = record.filter;

  if (Array.isArray(filter)) {
    return normalizeDatabaseFilters(filter);
  }

  const normalizedFilter = normalizeDatabaseFilter(filter);

  return normalizedFilter ? [normalizedFilter] : [];
}

export function getVisiblePropertiesForView(
  schema: DatabaseContextPayload,
  view: DatabaseContextPayload["views"][number],
) {
  const activeViewConfig = view.config ?? schema.database.config;
  const isKanbanView = view.type === "kanban";
  const activeVisibilityConfig = getActiveVisibilityConfig({
    activeViewConfig,
    isKanbanView,
    properties: schema.properties,
  });

  return schema.properties.filter(
    (property) =>
      !getPropertyHiddenForView(
        property.id,
        property.property.config,
        activeVisibilityConfig,
      ),
  );
}

export function getPropertyLabel(
  schema: DatabaseContextPayload,
  propertyId: string,
) {
  if (propertyId === "name") {
    return getNameColumnLabel(schema.database.config);
  }

  return (
    schema.properties.find((property) => property.property.id === propertyId)
      ?.property.name ??
    schema.properties.find((property) => property.id === propertyId)?.property
      .name ??
    propertyId
  );
}

export function getPropertyTypeHint(property: DatabasePropertySchema) {
  const { type, config } = property.property;
  const hints: string[] = [type];

  if (
    (type === "select" || type === "multi_select" || type === "status") &&
    config &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    Array.isArray((config as { options?: unknown }).options)
  ) {
    const optionNames = (
      config as { options: Array<{ name?: string }> }
    ).options
      .map((option) => option.name)
      .filter(
        (name): name is string => typeof name === "string" && name.length > 0,
      );

    if (optionNames.length > 0) {
      hints.push(optionNames.join(" | "));
    }
  }

  if (
    type === "formula" &&
    config &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    typeof (config as { formula?: unknown }).formula === "string"
  ) {
    hints.push(`formula: ${(config as { formula: string }).formula}`);
  }

  return hints.join(": ");
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

function normalizeDatabaseFilters(values: unknown[]) {
  return values.flatMap((value) => {
    const filter = normalizeDatabaseFilter(value);
    return filter ? [filter] : [];
  });
}

function normalizeDatabaseFilter(
  value: unknown,
): DatabasePropertyFilterConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const valueRecord = value as Record<string, unknown>;

  if (valueRecord.type === "group") {
    return null;
  }

  const propertyId = getDatabaseFilterPropertyId(valueRecord.propertyId);
  const operator =
    typeof valueRecord.operator === "string" ? valueRecord.operator : null;

  if (!propertyId || !operator) {
    return null;
  }

  return {
    operator,
    propertyId,
    values: getDatabaseFilterValues(valueRecord.values),
  };
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

function isDatabaseSortConfig(value: unknown): value is DatabaseSortConfig {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as DatabaseSortConfig).column === "string" &&
    ((value as DatabaseSortConfig).direction === "ascending" ||
      (value as DatabaseSortConfig).direction === "descending")
  );
}
