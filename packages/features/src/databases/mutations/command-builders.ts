import type {
  ChangeRowCommand,
  DatabasePropertyEntity,
  DatabaseRecordEntity,
} from "../core/entities";
import type { ConfigurationChange } from "../interactions/configuration";
import type { DatabaseCommandInput } from "./execute";

/*
 * Pure command construction shared by client operations and server executors.
 * Builders own defaults and anchor resolution; callers own scope resolution,
 * optimistic previews, transport and acknowledgements.
 */

export type DataSourceCommandScope = { dataSourceId: string; hostDatabaseId: string };

function sourceInput(
  scope: DataSourceCommandScope,
  command: DatabaseCommandInput["command"],
): DatabaseCommandInput {
  return { command, databaseId: scope.hostDatabaseId, dataSourceId: scope.dataSourceId };
}

function hostInput(databaseId: string, command: DatabaseCommandInput["command"]) {
  return { command, databaseId } satisfies DatabaseCommandInput;
}

// Databases

export function buildDatabaseCreate(input: {
  name?: string;
  pageId?: string;
  standalone?: boolean;
  teamspaceId?: string | null;
  workspaceId: string;
}): DatabaseCommandInput {
  return {
    databaseId: input.workspaceId,
    command: {
      ...input,
      type: "database.create",
      name: input.name ?? "New database",
      standalone: input.standalone ?? false,
    },
  };
}

export function buildDatabaseUpdate({
  databaseId,
  ...patch
}: {
  configuration?: ConfigurationChange[];
  databaseId: string;
  expectedPageId?: string | null;
  name?: string;
  pageId?: string | null;
}) {
  return hostInput(databaseId, { patch, type: "database.update" });
}

export function buildDatabaseState(
  databaseId: string,
  type: "database.archive" | "database.restore",
) {
  return hostInput(databaseId, { type });
}

export function buildDatabaseFavorite(input: { databaseId: string; isFavorite: boolean }) {
  return hostInput(input.databaseId, { type: "database.favorite", favorite: input.isFavorite });
}

// Data sources

export function buildDataSourceUpdate(
  scope: DataSourceCommandScope,
  patch: { configuration?: ConfigurationChange[]; name?: string },
) {
  return sourceInput(scope, { patch, type: "dataSource.update" });
}

export function buildDataSourceLink(input: {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
}) {
  return hostInput(input.databaseId, {
    type: "dataSource.link",
    dataSourceId: input.dataSourceId,
    afterId: null,
    beforeId: null,
    view: {
      name: input.name?.trim() || "",
      type: input.type?.trim() || "table",
      config: input.config ?? null,
    },
  });
}

export function buildDataSourceCreate(input: {
  config?: unknown;
  databaseId: string;
  name?: string;
  viewName?: string;
  viewType?: string;
}) {
  return hostInput(input.databaseId, {
    config: input.config ?? {},
    name: input.name?.trim() || "New data source",
    type: "dataSource.create",
    viewName: input.viewName?.trim() || "Table",
    viewType: input.viewType?.trim() || "table",
  });
}

export function buildDataSourceUnlink(input: { databaseId: string; dataSourceId: string }) {
  return hostInput(input.databaseId, {
    dataSourceId: input.dataSourceId,
    type: "dataSource.unlink",
  });
}

// Views

export function buildViewCreate(input: {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  name?: string;
  type?: string;
}) {
  return hostInput(input.databaseId, {
    afterViewId: null,
    beforeViewId: null,
    config: input.config ?? null,
    dataSourceId: input.dataSourceId,
    name: input.name?.trim() || "Table",
    type: "view.create",
    viewType: input.type?.trim() || "table",
  });
}

export function buildViewUpdate({
  databaseId,
  databaseViewId,
  ...patch
}: {
  configuration?: ConfigurationChange[];
  databaseId: string;
  databaseViewId: string;
  name?: string;
  type?: string;
}) {
  return hostInput(databaseId, { patch, type: "view.update", viewId: databaseViewId });
}

export function buildViewMove(input: {
  afterViewId: string | null;
  beforeViewId: string | null;
  databaseId: string;
  databaseViewId: string;
}) {
  return hostInput(input.databaseId, {
    afterViewId: input.afterViewId,
    beforeViewId: input.beforeViewId,
    type: "view.move",
    viewId: input.databaseViewId,
  });
}

export function buildViewDelete(input: { databaseId: string; databaseViewId: string }) {
  return hostInput(input.databaseId, { type: "view.delete", viewId: input.databaseViewId });
}

export function buildViewSetDataSource(input: {
  databaseId: string;
  databaseViewId: string;
  dataSourceId: string;
}) {
  return hostInput(input.databaseId, {
    dataSourceId: input.dataSourceId,
    type: "view.setDataSource",
    viewId: input.databaseViewId,
  });
}

// Properties

export function resolvePropertyCreateAnchors(
  properties: DatabasePropertyEntity[],
  dataSourceId: string,
  requestedPosition?: number,
) {
  const ids = properties
    .filter((property) => property.dataSourceId === dataSourceId)
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(({ id }) => id);
  const position = Math.max(0, Math.min(requestedPosition ?? ids.length, ids.length));
  return {
    afterPropertyId: ids[position - 1] ?? null,
    beforePropertyId: ids[position] ?? null,
  };
}

export function buildPropertyCreate(
  scope: DataSourceCommandScope,
  properties: DatabasePropertyEntity[],
  input: { config?: unknown; name?: string; position?: number; type?: string },
) {
  return sourceInput(scope, {
    ...resolvePropertyCreateAnchors(properties, scope.dataSourceId, input.position),
    config: input.config ?? null,
    name: input.name?.trim() || "Property",
    propertyType: input.type?.trim() || "text",
    type: "property.create",
  });
}

export function buildPropertyUpdate(
  scope: DataSourceCommandScope,
  {
    databasePropertyId,
    ...patch
  }: {
    configuration?: ConfigurationChange[];
    databasePropertyId: string;
    name?: string;
    type?: string;
    visible?: boolean;
    width?: number | null;
  },
) {
  return sourceInput(scope, { patch, propertyId: databasePropertyId, type: "property.update" });
}

export function buildPropertyMove(
  scope: DataSourceCommandScope,
  input: {
    afterPropertyId: string | null;
    beforePropertyId: string | null;
    databasePropertyId: string;
  },
) {
  return sourceInput(scope, {
    afterPropertyId: input.afterPropertyId,
    beforePropertyId: input.beforePropertyId,
    propertyId: input.databasePropertyId,
    type: "property.move",
  });
}

export function buildPropertyState(
  scope: DataSourceCommandScope,
  databasePropertyId: string,
  type: "property.archive" | "property.restore",
) {
  return sourceInput(scope, { propertyId: databasePropertyId, type });
}

export function buildPropertyDuplicate(
  scope: DataSourceCommandScope,
  input: { databasePropertyId: string; includeValues?: boolean },
) {
  return sourceInput(scope, {
    includeValues: input.includeValues ?? false,
    propertyId: input.databasePropertyId,
    type: "property.duplicate",
  });
}

// Templates

export function buildTemplateApply(
  scope: DataSourceCommandScope,
  input: {
    config: unknown;
    name: string;
    properties: Array<{ config?: unknown; name: string; type: string }>;
    rows: Array<{
      content?: unknown;
      metadata?: unknown;
      title: string;
      values: Array<{ propertyName: string; value: unknown }>;
    }>;
  },
) {
  return sourceInput(scope, { ...input, type: "template.apply" });
}

export function buildTemplateCreate(
  scope: DataSourceCommandScope,
  input: { name: string; template: unknown },
) {
  return sourceInput(scope, {
    name: input.name,
    template: input.template,
    type: "template.create",
  });
}

export function buildTemplateUpdate(
  scope: DataSourceCommandScope,
  input: { patch: unknown; templateId: string },
) {
  return sourceInput(scope, {
    patch: input.patch,
    templateId: input.templateId,
    type: "template.update",
  });
}

export function buildTemplateState(
  scope: DataSourceCommandScope,
  templateId: string,
  type: "template.archive" | "template.restore",
) {
  return sourceInput(scope, { templateId, type });
}

// Rows

export function resolveRowCreateAnchors(
  records: DatabaseRecordEntity[],
  input: { afterRowId?: string | null; beforeRowId?: string | null; position?: number },
) {
  if (input.beforeRowId !== undefined || input.afterRowId !== undefined)
    return { afterRowId: input.afterRowId ?? null, beforeRowId: input.beforeRowId ?? null };
  const index = Math.max(0, Math.min(input.position ?? records.length, records.length));
  return { afterRowId: records[index - 1]?.id ?? null, beforeRowId: records[index]?.id ?? null };
}

export type RowPlaceSource = {
  databaseId: string;
  dataSourceId: string;
  propertyMode: "duplicate" | "match";
  rowId: string;
};

export function buildRowPlace(
  scope: DataSourceCommandScope,
  records: DatabaseRecordEntity[],
  input: {
    afterRowId?: string | null;
    beforeRowId?: string | null;
    clearSortViewId?: string;
    hierarchy?: ChangeRowCommand["hierarchy"];
    initialValues?: Array<{ propertyId: string; value: unknown }>;
    pageId?: string;
    parentRowId?: string | null;
    position?: number;
    source?: RowPlaceSource;
    title?: string;
  },
) {
  const anchors = resolveRowCreateAnchors(records, input);
  const valuesByPropertyId = input.initialValues
    ? Object.fromEntries(input.initialValues.map(({ propertyId, value }) => [propertyId, value]))
    : undefined;
  const parentRowId = input.hierarchy?.parentRowId ?? input.parentRowId ?? null;
  return {
    anchors,
    parentRowId,
    valuesByPropertyId,
    input: sourceInput(scope, {
      type: "row.place",
      ...(input.clearSortViewId ? { clearSortViewId: input.clearSortViewId } : {}),
      ...anchors,
      pageId: input.pageId,
      parentRowId,
      title: input.title,
      hierarchy: input.hierarchy,
      valuesByPropertyId,
      ...(input.source ? { source: input.source } : {}),
    }),
  };
}

export function buildRowChange(
  scope: DataSourceCommandScope,
  change: Omit<ChangeRowCommand, "type">,
) {
  return sourceInput(scope, {
    ...change,
    ...(change.placement
      ? {
          placement: {
            afterRowId: change.placement.afterRowId,
            beforeRowId: change.placement.beforeRowId,
          },
        }
      : {}),
    type: "row.change",
  });
}

export function buildRowState(
  scope: DataSourceCommandScope,
  rowId: string,
  type: "row.archive" | "row.restore",
) {
  return sourceInput(scope, { type, rowId });
}

export function buildRowDuplicate(
  scope: DataSourceCommandScope,
  input: { parentRowId?: string | null; rowId: string },
) {
  return sourceInput(scope, {
    type: "row.duplicate",
    rowId: input.rowId,
    ...(input.parentRowId !== undefined ? { parentRowId: input.parentRowId } : {}),
  });
}

export function buildRowMoveToPage(
  scope: DataSourceCommandScope,
  input: { pageId: string; rowId: string },
) {
  return sourceInput(scope, { type: "row.moveToPage", rowId: input.rowId, pageId: input.pageId });
}
